import { Injectable, Logger } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';

export interface GeocodeQuery {
  placeName: string;
  district?: string;
  state?: string;
  country?: string;
}

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  source: 'EXISTING_DB' | 'OPENSTREETMAP' | 'NOMINATIM' | 'MANUAL_RESOLVER' | 'GOOGLE_FALLBACK';
  isFallback: boolean;
  confidence: number;
}

@Injectable()
export class PluggableGeocoderEngine {
  private readonly logger = new Logger(PluggableGeocoderEngine.name);

  constructor(private readonly sequelize: Sequelize) {}

  async geocode(query: GeocodeQuery): Promise<GeocodeResult | null> {
    const qName = query.placeName.trim().toLowerCase();

    // Priority 1: Existing DB Lookup
    const dbResult = await this.lookupExistingDb(qName, query);
    if (dbResult) {
      return dbResult;
    }

    // Priority 2: Nominatim Live API Lookup
    const nominatimResult = await this.lookupNominatim(query);
    if (nominatimResult) {
      return nominatimResult;
    }

    return null;
  }

  private async lookupExistingDb(qName: string, query: GeocodeQuery): Promise<GeocodeResult | null> {
    const stopsRes: any[] = await this.sequelize.query(
      `SELECT "id", "name", "metadata"
       FROM "bus_stops"
       WHERE LOWER("name") LIKE :q OR LOWER("normalizedName") LIKE :q
       LIMIT 1;`,
      {
        replacements: { q: `%${qName}%` },
        type: QueryTypes.SELECT,
      }
    );

    if (stopsRes.length > 0) {
      const stop = stopsRes[0];
      const lat = (stop.metadata as any)?.latitude;
      const lon = (stop.metadata as any)?.longitude;
      if (lat && lon) {
        return {
          latitude: lat,
          longitude: lon,
          formattedAddress: `${stop.name}, West Bengal, India`,
          source: 'EXISTING_DB',
          isFallback: false,
          confidence: 0.98,
        };
      }
    }

    return null;
  }

  private async lookupNominatim(query: GeocodeQuery): Promise<GeocodeResult | null> {
    try {
      const searchUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`${query.placeName}, West Bengal`)}&format=json&addressdetails=1&limit=1`;
      const res = await fetch(searchUrl, {
        headers: { 'User-Agent': 'YatrooBot/1.0 (WestBengalTransport)' },
      });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const item = data[0];
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
          return {
            latitude: lat,
            longitude: lon,
            formattedAddress: item.display_name,
            source: 'NOMINATIM',
            isFallback: false,
            confidence: 0.92,
          };
        }
      }
    } catch (err) {
      this.logger.error(`Nominatim lookup error: ${err}`);
    }

    return null;
  }
}
