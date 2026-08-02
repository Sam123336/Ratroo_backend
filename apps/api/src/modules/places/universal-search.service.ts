import { Injectable } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';

export type SearchCategory =
  | 'VILLAGE'
  | 'TOWN'
  | 'AREA'
  | 'LANDMARK'
  | 'HOSPITAL'
  | 'COLLEGE'
  | 'BUS_STOP'
  | 'METRO_STATION'
  | 'RAILWAY_STATION'
  | 'FERRY_TERMINAL'
  | 'TRAM_STOP'
  | 'BUS_NUMBER'
  | 'BUS_NAME'
  | 'ROUTE_NUMBER'
  | 'OPERATOR';

export interface SearchResultItem {
  id: string;
  category: SearchCategory;
  title: string;
  subtitle?: string;
  latitude?: number;
  longitude?: number;
  district?: string;
  block?: string;
  providerCode: string;
  aliases: string[];
  relevanceScore: number;
}

@Injectable()
export class UniversalSearchService {
  constructor(private readonly sequelize: Sequelize) {}

  async search(query: string, categoryFilter?: SearchCategory): Promise<SearchResultItem[]> {
    const q = (query || '').toLowerCase().trim();
    if (!q) return [];

    // Query places and place_aliases from PostgreSQL database
    const placesRes: Array<{
      id: string;
      name: string;
      latitude: number;
      longitude: number;
      aliases: string[];
    }> = await this.sequelize.query(
      `SELECT p.id, p."canonicalName" as "name", p.latitude, p.longitude, 
              COALESCE(ARRAY_AGG(DISTINCT pa.alias) FILTER (WHERE pa.alias IS NOT NULL), ARRAY[]::VARCHAR[]) as aliases
       FROM "places" p
       LEFT JOIN "place_aliases" pa ON p.id = pa."placeId"
       WHERE LOWER(p."canonicalName") LIKE :query 
          OR LOWER(p."normalizedName") LIKE :query 
          OR LOWER(pa.alias) LIKE :query
          OR LOWER(pa."normalizedAlias") LIKE :query
       GROUP BY p.id, p."canonicalName", p.latitude, p.longitude
       LIMIT 10;`,
      {
        replacements: { query: `%${q}%` },
        type: QueryTypes.SELECT,
      }
    );

    // Query bus_routes from PostgreSQL database
    const routesRes: Array<{
      id: string;
      longName: string;
      providerCode: string;
      metadata: any;
    }> = await this.sequelize.query(
      `SELECT "id", "longName", "providerCode", "metadata"
       FROM "bus_routes"
       WHERE LOWER("longName") LIKE :query
       LIMIT 10;`,
      {
        replacements: { query: `%${q}%` },
        type: QueryTypes.SELECT,
      }
    );

    const results: SearchResultItem[] = [];

    placesRes.forEach((place) => {
      results.push({
        id: place.id,
        category: 'BUS_STOP',
        title: place.name,
        subtitle: `Canonical Place`,
        latitude: place.latitude,
        longitude: place.longitude,
        providerCode: 'CANONICAL',
        aliases: place.aliases || [],
        relevanceScore: 0.95,
      });
    });

    routesRes.forEach((route) => {
      results.push({
        id: route.id,
        category: 'BUS_NAME',
        title: route.longName,
        subtitle: `${route.providerCode} Route`,
        providerCode: route.providerCode,
        aliases: [],
        relevanceScore: 0.90,
      });
    });

    return results;
  }
}
