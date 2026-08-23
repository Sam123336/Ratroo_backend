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
      // The service number lives in metadata.shortName, so matching longName
      // alone meant "500D" or "KIA-8" — the thing riders actually type — found
      // nothing. Exact matches on the number lead, then prefix, then the rest.
      //
      // One row per service, not one per direction. BMTC route ids are
      // directional, so a service arrives as two rows carrying the same number
      // and the same "A <-> B" name, which reads as the same bus listed twice.
      // Collapsing on what is displayed is deliberate: directionId cannot do
      // this job, because WBBUS fills it with the literal 'UP'/'DOWN' and
      // grouping on that would fold unrelated routes into one.
      `SELECT "id", "longName", "providerCode", "metadata"
       FROM (
         SELECT DISTINCT ON ("providerCode", LOWER(COALESCE("metadata"->>'shortName', '')), LOWER("longName"))
                "id", "longName", "providerCode", "metadata"
         FROM "bus_routes"
         WHERE LOWER("longName") LIKE :query
            OR LOWER("metadata"->>'shortName') LIKE :query
         ORDER BY "providerCode",
                  LOWER(COALESCE("metadata"->>'shortName', '')),
                  LOWER("longName"),
                  "id"
       ) AS services
       ORDER BY
         CASE
           WHEN LOWER("metadata"->>'shortName') = :exact THEN 0
           WHEN LOWER("metadata"->>'shortName') LIKE :prefix THEN 1
           ELSE 2
         END,
         "longName"
       LIMIT :limit;`,
      {
        replacements: { query: `%${query}%`, exact: query, prefix: `${query}%`, limit },
        type: QueryTypes.SELECT,
      }
    );
  }
}
