import { Injectable } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';

@Injectable()
export class JourneyRepository {
  constructor(private readonly sequelize: Sequelize) {}

  /**
   * `LIKE '%name%' LIMIT 1` returned whichever row Postgres happened to reach
   * first — for "Kolkata" that was a place with no coordinates, so every
   * journey from it was unplannable. Rank instead: usable coordinates first,
   * then exact match, then prefix, then shortest name.
   */
  async findPlaceByName(name: string): Promise<any | null> {
    const cleanName = name.trim().toLowerCase();
    const search: any[] = await this.sequelize.query(
      `SELECT * FROM "places"
       WHERE LOWER("canonicalName") LIKE :like OR LOWER("normalizedName") LIKE :like
       ORDER BY
         ("latitude" IS NOT NULL AND "longitude" IS NOT NULL) DESC,
         (LOWER("canonicalName") = :exact) DESC,
         (LOWER("canonicalName") LIKE :prefix) DESC,
         LENGTH("canonicalName") ASC
       LIMIT 1;`,
      {
        replacements: { like: `%${cleanName}%`, exact: cleanName, prefix: `${cleanName}%` },
        type: QueryTypes.SELECT,
      }
    );
    if (search.length > 0) return search[0];
    return null;
  }

  async findConnectingRoutes(originPlaceId: string, destPlaceId: string): Promise<Array<{ id: string; longName: string; providerCode: string }>> {
    return this.sequelize.query(
      `SELECT r."id", r."longName", r."providerCode"
       FROM "bus_routes" r
       JOIN "bus_route_stops" rs1 ON rs1."routeId" = r."id"
       JOIN "bus_stops" s1 ON s1."id" = rs1."stopId"
       JOIN "bus_route_stops" rs2 ON rs2."routeId" = r."id"
       JOIN "bus_stops" s2 ON s2."id" = rs2."stopId"
       WHERE s1."placeId" = :originPlaceId AND s2."placeId" = :destPlaceId
         AND rs1."sequence" < rs2."sequence"
       LIMIT 1;`,
      {
        replacements: { originPlaceId, destPlaceId },
        type: QueryTypes.SELECT,
      }
    );
  }
}
