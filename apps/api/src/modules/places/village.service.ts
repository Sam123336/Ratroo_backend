import { Injectable, NotFoundException } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';
import { NearestStopEngine } from './nearest-stop.engine';

function isUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

@Injectable()
export class VillageService {
  constructor(
    private readonly nearestStopEngine: NearestStopEngine,
    private readonly sequelize: Sequelize
  ) {}

  async getVillageCoverageById(id: string) {
    const cleanId = id.replace(/_/g, ' ').toLowerCase();
    let villagePlace: any = null;

    if (isUuid(id)) {
      const res = await this.sequelize.query(
        `SELECT * FROM "places" WHERE id = :id LIMIT 1;`,
        { replacements: { id }, type: QueryTypes.SELECT }
      );
      if (res.length > 0) villagePlace = res[0];
    }

    if (!villagePlace) {
      const searchRes: any[] = await this.sequelize.query(
        `SELECT * FROM "places" WHERE LOWER("canonicalName") LIKE :query OR LOWER("normalizedName") LIKE :query LIMIT 1;`,
        {
          replacements: { query: `%${cleanId}%` },
          type: QueryTypes.SELECT,
        }
      );
      if (searchRes.length > 0) {
        villagePlace = searchRes[0];
      }
    }

    if (!villagePlace) {
      throw new NotFoundException(`Village or place '${id}' not found in canonical graph.`);
    }

    const vLat = villagePlace.latitude ? parseFloat(villagePlace.latitude) : 0;
    const vLon = villagePlace.longitude ? parseFloat(villagePlace.longitude) : 0;
    const district = villagePlace.districtId; // Just for fallback, assuming hierarchy exists
    const block = villagePlace.blockId;

    let candidateStops: any[] = [];

    if (vLat !== 0 && vLon !== 0) {
      candidateStops = await this.sequelize.query(
        `SELECT * FROM "places" 
         WHERE "latitude" BETWEEN :minLat AND :maxLat
           AND "longitude" BETWEEN :minLon AND :maxLon
         LIMIT 200;`,
        { 
          replacements: { 
            minLat: vLat - 0.5, maxLat: vLat + 0.5, 
            minLon: vLon - 0.5, maxLon: vLon + 0.5 
          }, 
          type: QueryTypes.SELECT 
        }
      );
    } else {
      candidateStops = await this.sequelize.query(
        `SELECT * FROM "places" 
         WHERE "latitude" BETWEEN 21.5 AND 27.5
           AND "longitude" BETWEEN 85.8 AND 89.9
         LIMIT 200;`,
        { type: QueryTypes.SELECT }
      );
    }

    // Exclude the village node itself if other candidates exist
    const otherStops = candidateStops.filter((s) => s.id !== villagePlace.id);
    const stopsToSearch = otherStops.length > 0 ? otherStops : candidateStops;

    const nearestRes = this.nearestStopEngine.findNearestStop(
      villagePlace.canonicalName,
      vLat,
      vLon,
      stopsToSearch.map((s) => ({
        externalId: s.id, // This is now placeId
        providerCode: 'CANONICAL',
        nodeType: s.type || 'BUS_STOP',
        name: s.canonicalName,
        normalizedName: s.normalizedName,
        aliases: [],
        latitude: parseFloat(s.latitude || '0'),
        longitude: parseFloat(s.longitude || '0'),
        geography: { countryCode: 'IN', stateCode: 'WB' } as any,
        confidence: parseFloat(s.confidence || '0.90'),
      }))
    );

    const routesCountRes: Array<{ count: string }> = await this.sequelize.query(
      `SELECT COUNT(DISTINCT r."id") as count
       FROM "bus_routes" r
       JOIN "bus_route_stops" rs ON rs."routeId" = r."id"
       JOIN "bus_stops" s ON s."id" = rs."stopId"
       WHERE s."placeId" = :stopId;`,
      {
        replacements: { stopId: nearestRes.nearestStop.externalId },
        type: QueryTypes.SELECT,
      }
    );

    const availableBuses: Array<{ routeId: string; name: string; providerCode: string }> = await this.sequelize.query(
      `SELECT DISTINCT r."id" as "routeId", r."longName" as "name", r."providerCode"
       FROM "bus_routes" r
       JOIN "bus_route_stops" rs ON rs."routeId" = r."id"
       JOIN "bus_stops" s ON s."id" = rs."stopId"
       WHERE s."placeId" = :stopId
       LIMIT 10;`,
      {
        replacements: { stopId: nearestRes.nearestStop.externalId },
        type: QueryTypes.SELECT,
      }
    );

    return {
      villageId: villagePlace.id,
      villageName: villagePlace.canonicalName,
      gramPanchayat: villagePlace.gpId || null,
      block: block || null,
      district: district || null,
      state: 'West Bengal',
      nearestStop: {
        id: nearestRes.nearestStop.externalId,
        name: nearestRes.nearestStop.name,
        providerCode: nearestRes.nearestStop.providerCode,
      },
      distanceKm: nearestRes.distanceKm,
      walkingTimeMinutes: nearestRes.walkingTimeMinutes,
      availableRoutesCount: parseInt(routesCountRes[0]?.count || '0', 10),
      availableBuses,
    };
  }

  async getNearestStopForLocation(id: string) {
    const village = await this.getVillageCoverageById(id);
    return {
      locationId: id,
      locationName: village.villageName,
      nearestStop: village.nearestStop,
      distanceKm: village.distanceKm,
      walkingTimeMinutes: village.walkingTimeMinutes,
    };
  }
}
