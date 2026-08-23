import { Injectable } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';

export interface PlaceSearchResult {
  id: string;
  name: string;
  type: string | null;
  latitude: number;
  longitude: number;
  aliases: string[];
}

export interface RouteSearchResult {
  id: string;
  longName: string;
  providerCode: string;
  /** Carries `shortName` — the service number riders actually use. */
  metadata: { shortName?: string } & Record<string, unknown>;
}

@Injectable()
export class SearchRepository {
  constructor(private readonly sequelize: Sequelize) {}

  async findPlaces(query: string, limit: number = 10): Promise<PlaceSearchResult[]> {
    return this.sequelize.query(
      `SELECT p.id, p."canonicalName" as "name", p."type", p.latitude, p.longitude, 
              COALESCE(ARRAY_AGG(DISTINCT pa.alias) FILTER (WHERE pa.alias IS NOT NULL), ARRAY[]::VARCHAR[]) as aliases
       FROM "places" p
       LEFT JOIN "place_aliases" pa ON p.id = pa."placeId"
       WHERE LOWER(p."canonicalName") LIKE :query 
          OR LOWER(p."normalizedName") LIKE :query 
          OR LOWER(pa.alias) LIKE :query
          OR LOWER(pa."normalizedAlias") LIKE :query
       GROUP BY p.id, p."canonicalName", p."type", p.latitude, p.longitude
       LIMIT :limit;`,
      {
        replacements: { query: `%${query}%`, limit },
        type: QueryTypes.SELECT,
      }
    );
  }

  async findRoutes(query: string, limit: number = 10): Promise<RouteSearchResult[]> {
    return this.sequelize.query(
      `SELECT "id", "longName", "providerCode", "metadata"
       FROM "bus_routes"
       WHERE LOWER("longName") LIKE :query
       LIMIT :limit;`,
      {
        replacements: { query: `%${query}%`, limit },
        type: QueryTypes.SELECT,
      }
    );
  }
}
