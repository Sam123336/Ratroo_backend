import { Injectable, Logger } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';
import { GeocodingAliasService } from './geocoding-alias.service';

export interface GeocodeQuery {
  placeName: string;
  district?: string;
  block?: string;
  state?: string;
  country?: string;
}

export type GeocodeFailureReason = 
  | 'FAILURE_NO_NOMINATIM_RESULT'
  | 'FAILURE_AMBIGUOUS'
  | 'FAILURE_LOW_CONFIDENCE'
  | 'FAILURE_MISSING_DISTRICT'
  | 'FAILURE_PROVIDER_TYPO'
  | 'FAILURE_NO_CANONICAL_MATCH'
  | 'FAILURE_UNKNOWN';

export interface GeocodeResult {
  latitude?: number;
  longitude?: number;
  formattedAddress?: string;
  source?: 'EXISTING_DB' | 'OPENSTREETMAP' | 'NOMINATIM' | 'MANUAL_RESOLVER' | 'GOOGLE_FALLBACK';
  isFallback?: boolean;
  confidence?: number;
  
  // If failed
  failed?: boolean;
  failureReason?: GeocodeFailureReason;
}

// West Bengal bounding box for validation
const WB_BBOX = { latMin: 21.5, latMax: 27.5, lonMin: 85.8, lonMax: 89.9 };

@Injectable()
export class PluggableGeocoderEngine {
  private readonly logger = new Logger(PluggableGeocoderEngine.name);
  private lastNominatimCall = 0;

  constructor(
    private readonly sequelize: Sequelize,
    private readonly aliasService: GeocodingAliasService
  ) {}

  async geocode(query: GeocodeQuery): Promise<GeocodeResult> {
    const rawName = query.placeName.trim();
    const qName = this.aliasService.normalizeName(rawName);

    // Priority 1: Existing DB Lookup (Cross provider ranking)
    const dbResult = await this.lookupExistingDb(qName, rawName, query);
    if (dbResult) {
      return dbResult;
    }

    // Priority 2: Nominatim Live API Lookup with district context
    const nominatimResult = await this.lookupNominatim(query, qName);
    if (nominatimResult) {
      return nominatimResult;
    }

    return { failed: true, failureReason: 'FAILURE_NO_NOMINATIM_RESULT' };
  }

  private async lookupExistingDb(qName: string, rawName: string, query: GeocodeQuery): Promise<GeocodeResult | null> {
    // Fetch candidates from DB that have valid coordinates
    const candidates: any[] = await this.sequelize.query(
      `SELECT "id", "canonicalName" as "name", "latitude", "longitude", "districtId" as "district"
       FROM "places"
       WHERE "latitude" IS NOT NULL
         AND "latitude" BETWEEN :latMin AND :latMax
         AND "longitude" BETWEEN :lonMin AND :lonMax
         AND (
           LOWER("canonicalName") = :rawLower OR
           LOWER("canonicalName") LIKE :fuzzyQ OR
           LOWER("normalizedName") LIKE :fuzzyQ
         )
       LIMIT 50;`,
      {
        replacements: {
          rawLower: rawName.toLowerCase(),
          fuzzyQ: `%${qName.substring(0, 5)}%`,
          latMin: WB_BBOX.latMin,
          latMax: WB_BBOX.latMax,
          lonMin: WB_BBOX.lonMin,
          lonMax: WB_BBOX.lonMax,
        },
        type: QueryTypes.SELECT,
      }
    );

    if (candidates.length === 0) return null;

    let bestCandidate = null;
    let bestScore = 0;
    let bestConfidence = 0;

    for (const candidate of candidates) {
      const cName = this.aliasService.normalizeName(candidate.name);
      
      // Calculate string similarity
      const sim = this.aliasService.similarityScore(qName, cName);
      let confidence = 0;

      // Exact match
      if (sim === 1.0) {
        confidence = 0.98; // Canonical / Exact match
      } else if (sim >= 0.8) {
        confidence = 0.92; // Provider exact/close match
      } else if (sim >= 0.6) {
        confidence = 0.84; // Fuzzy match
      } else {
        continue; // Too dissimilar
      }

      // If we have a district, and the candidate has a district, they must match
      if (query.district) {
        const cDist = candidate.district?.toLowerCase();
        if (cDist && !cDist.includes(query.district.toLowerCase()) && !query.district.toLowerCase().includes(cDist)) {
          // District mismatch, penalize heavily
          confidence -= 0.3;
        }
      }

      if (confidence > bestConfidence || (confidence === bestConfidence && sim > bestScore)) {
        bestConfidence = confidence;
        bestScore = sim;
        bestCandidate = candidate;
      }
    }

    if (bestCandidate && bestConfidence >= 0.8) {
      const lat = parseFloat(bestCandidate.latitude);
      const lon = parseFloat(bestCandidate.longitude);
      
      return {
        latitude: lat,
        longitude: lon,
        formattedAddress: `${bestCandidate.name}, West Bengal, India`,
        source: 'EXISTING_DB',
        isFallback: false,
        confidence: bestConfidence,
      };
    }

    return null;
  }

  private async lookupNominatim(query: GeocodeQuery, normalizedName: string): Promise<GeocodeResult | null> {
    try {
      // Rate limit: 1 request per second
      const now = Date.now();
      const elapsed = now - this.lastNominatimCall;
      if (elapsed < 1100) {
        await new Promise((resolve) => setTimeout(resolve, 1100 - elapsed));
      }
      this.lastNominatimCall = Date.now();

      // District aware matching
      const parts = [normalizedName];
      if (query.block) parts.push(query.block);
      if (query.district) parts.push(query.district);
      parts.push(query.state || 'West Bengal');
      parts.push(query.country || 'India');
      const searchTerm = parts.join(', ');

      const searchUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchTerm)}&format=json&addressdetails=1&limit=3`;
      const res = await fetch(searchUrl, {
        headers: { 'User-Agent': 'YatrooBot/2.0 (WestBengalTransport)' },
      });
      const data = await res.json();
      
      if (Array.isArray(data) && data.length > 0) {
        // Find best match in WB
        for (const item of data) {
          const lat = parseFloat(item.lat);
          const lon = parseFloat(item.lon);

          if (
            !Number.isNaN(lat) &&
            !Number.isNaN(lon) &&
            lat >= WB_BBOX.latMin &&
            lat <= WB_BBOX.latMax &&
            lon >= WB_BBOX.lonMin &&
            lon <= WB_BBOX.lonMax
          ) {
            const importance = parseFloat(item.importance) || 0.5;
            // Nominatim is less confident generally
            const confidence = Math.min(0.85, 0.60 + importance * 0.15);

            return {
              latitude: lat,
              longitude: lon,
              formattedAddress: item.display_name,
              source: 'NOMINATIM',
              isFallback: false,
              confidence: Number(confidence.toFixed(2)),
            };
          }
        }
      } else {
        // If it failed and we didn't have a district, maybe we need one
        if (!query.district) {
          return { failed: true, failureReason: 'FAILURE_MISSING_DISTRICT' };
        }
      }
    } catch (err) {
      this.logger.error(`Nominatim lookup error: ${err}`);
    }

    return null;
  }
}
