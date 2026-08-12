import { Injectable, Logger } from '@nestjs/common';
import { GeocodingAliasService } from '../geocoding/geocoding-alias.service';
import { PlaceModel, PlaceType, PlaceAliasModel } from '../../places/entities/place.model';
import { BusStopModel } from '../infrastructure/sequelize/models/bus-network.model';
import * as crypto from 'crypto';
import { Op } from 'sequelize';

@Injectable()
export class CanonicalStopResolutionEngine {
  private readonly logger = new Logger(CanonicalStopResolutionEngine.name);

  // In-memory caches for fast processing
  private canonicalPlaces: PlaceModel[] = [];
  private placeAliases: PlaceAliasModel[] = [];
  private isLoaded = false;

  constructor(
    private readonly aliasService: GeocodingAliasService,
  ) {}

  /**
   * Loads all canonical STOP places and their aliases into memory for fast matching.
   */
  async preloadMemoryGraph() {
    this.logger.log('Preloading canonical graph into memory...');
    this.canonicalPlaces = await PlaceModel.findAll({
      where: { type: PlaceType.STOP },
    });

    this.placeAliases = await PlaceAliasModel.findAll();
    this.isLoaded = true;
    this.logger.log(`Loaded ${this.canonicalPlaces.length} stops and ${this.placeAliases.length} aliases.`);
  }

  /**
   * Fast bulk resolution engine that resolves thousands of stops entirely in memory,
   * generating a batch of database writes to commit at the end.
   */
  async bulkResolveStops(rawStops: BusStopModel[]) {
    if (!this.isLoaded) {
      await this.preloadMemoryGraph();
    }

    const placesToCreate: any[] = [];
    const aliasesToCreate: any[] = [];
    
    // We use raw sql update queries for bus_stops because bulk update is tricky in sequelize
    const busStopUpdates: { id: string; placeId: string }[] = [];
    const placeCoordUpdates: { id: string; lat: number; lon: number; conf: number; source: string }[] = [];

    this.logger.log(`Beginning memory resolution of ${rawStops.length} stops...`);
    
    let processed = 0;
    for (const rawStop of rawStops) {
      const normalizedName = this.aliasService.normalizeName(rawStop.name);
      let matchedPlace: PlaceModel | undefined;

      // 1. Exact Match
      matchedPlace = this.canonicalPlaces.find((p) => p.canonicalName.toLowerCase() === normalizedName);

      // 2. Alias Match
      if (!matchedPlace) {
        const aliasMatch = this.placeAliases.find((a) => a.normalizedAlias === normalizedName);
        if (aliasMatch) {
          matchedPlace = this.canonicalPlaces.find((p) => p.id === aliasMatch.placeId);
        }
      }

      // 3. Fuzzy Match
      if (!matchedPlace) {
        let bestScore = 0;
        let bestMatch: PlaceModel | undefined;

        for (const place of this.canonicalPlaces) {
          const score = this.aliasService.similarityScore(normalizedName, place.canonicalName.toLowerCase());
          if (score > bestScore) {
            bestScore = score;
            bestMatch = place;
          }
        }

        if (bestScore >= 0.85 && bestMatch) {
          matchedPlace = bestMatch;
        }
      }

      const rawLat = (rawStop.metadata as any)?.latitude;
      const rawLon = (rawStop.metadata as any)?.longitude;
      const rawConf = (rawStop.metadata as any)?.coordinateConfidence || 0;

      if (matchedPlace) {
        // Queue Coordinate Upgrade if needed
        if (rawLat && rawLon && rawConf > (matchedPlace.coordinateConfidence || 0)) {
          placeCoordUpdates.push({
            id: matchedPlace.id,
            lat: rawLat,
            lon: rawLon,
            conf: rawConf,
            source: rawStop.providerCode,
          });
          matchedPlace.latitude = rawLat;
          matchedPlace.longitude = rawLon;
          matchedPlace.coordinateConfidence = rawConf;
        }
      } else {
        // Generate new canonical place
        const newPlaceId = crypto.randomUUID();
        const newPlaceObj = {
          id: newPlaceId,
          // Scraped stop names occasionally arrive as a whole block of page
          // text. The column is varchar(255), so an untruncated one aborted the
          // entire bulkCreate and failed the whole ingestion run.
          canonicalName: (rawStop.name || '').slice(0, 255),
          normalizedName: (normalizedName || '').slice(0, 255),
          type: PlaceType.STOP,
          latitude: rawLat || null,
          longitude: rawLon || null,
          coordinateConfidence: rawLat ? rawConf : null,
          coordinateSource: rawLat ? rawStop.providerCode : null,
          coordinateUpdatedAt: rawLat ? new Date() : null,
          providerSource: rawStop.providerCode,
          confidence: 1.0,
        };
        placesToCreate.push(newPlaceObj);
        matchedPlace = newPlaceObj as any; // Cast for memory use
        this.canonicalPlaces.push(matchedPlace!); // Add to memory for subsequent stops
      }

      // Check Alias
      const existingAlias = this.placeAliases.find(
        (a) => a.placeId === matchedPlace!.id && a.normalizedAlias === normalizedName
      );

      if (!existingAlias) {
        const newAliasObj = {
          id: crypto.randomUUID(),
          placeId: matchedPlace!.id,
          providerCode: rawStop.providerCode,
          // Same varchar(255) ceiling as places — see above.
          alias: (rawStop.name || '').slice(0, 255),
          normalizedAlias: (normalizedName || '').slice(0, 255),
          confidence: 1.0,
        };
        aliasesToCreate.push(newAliasObj);
        this.placeAliases.push(newAliasObj as any);
      }

      busStopUpdates.push({ id: rawStop.id, placeId: matchedPlace!.id });
      
      processed++;
      if (processed % 2000 === 0) {
        this.logger.log(`Memory Resolution: ${processed}/${rawStops.length}`);
      }
    }

    this.logger.log(`Resolution complete. Generated ${placesToCreate.length} new places, ${aliasesToCreate.length} new aliases.`);
    
    // Commit to DB
    this.logger.log('Committing to database...');
    
    if (placesToCreate.length > 0) {
      await PlaceModel.bulkCreate(placesToCreate);
    }
    
    if (aliasesToCreate.length > 0) {
      await PlaceAliasModel.bulkCreate(aliasesToCreate);
    }

    // Bulk update coordinates using raw sql for speed
    for (const update of placeCoordUpdates) {
      await PlaceModel.sequelize!.query(
        `UPDATE "places" SET "latitude" = $1, "longitude" = $2, "coordinateConfidence" = $3, "coordinateSource" = $4, "coordinateUpdatedAt" = NOW() WHERE "id" = $5;`,
        { bind: [update.lat, update.lon, update.conf, update.source, update.id] }
      );
    }

    // Update bus stops with placeId
    // We will do this in batches of 500
    const BATCH_SIZE = 500;
    for (let i = 0; i < busStopUpdates.length; i += BATCH_SIZE) {
      const batch = busStopUpdates.slice(i, i + BATCH_SIZE);
      const updateCase = batch.map(u => `WHEN id = '${u.id}' THEN '${u.placeId}'::uuid`).join(' ');
      const ids = batch.map(u => `'${u.id}'`).join(',');
      
      await BusStopModel.sequelize!.query(`
        UPDATE "bus_stops" 
        SET "placeId" = CASE ${updateCase} END
        WHERE id IN (${ids});
      `);
      this.logger.log(`Committed bus_stops links: ${Math.min(i + BATCH_SIZE, busStopUpdates.length)} / ${busStopUpdates.length}`);
    }

    this.logger.log('Database commit successful.');
  }
}
