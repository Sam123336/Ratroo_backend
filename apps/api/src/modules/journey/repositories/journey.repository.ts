import { Injectable } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';

@Injectable()
export class JourneyRepository {
  constructor(private readonly sequelize: Sequelize) {}

  /**
   * Places a name could mean, best first.
   *
   * `LIKE '%name%' LIMIT 1` returned whichever row Postgres happened to reach
   * first — for "Kolkata" that was a place with no coordinates, so every
   * journey from it was unplannable. Ranking fixed that but put coordinates
   * above the name itself, which broke a different case: asking for "Asansol"
   * returned "Asansol Bus Terminus", a different operator's stop with no
   * services from the origin. The planner then reported no route between two
   * places that six routes connect.
   *
   * So the name the rider actually typed wins first, and coordinates only
   * break ties between equally good name matches. Missing coordinates are no
   * longer fatal anyway — the planner falls back to matching stops by name.
   */
  async findPlacesByName(name: string, limit = 3): Promise<any[]> {
    const cleanName = name.trim().toLowerCase();
    return this.sequelize.query(
      // Aliases are searched alongside the place's own titles. Operators name
      // the same stand differently — "ARAMBAG (NS)", "Durgapur (Muchipara)" —
      // and `places` keeps only one of those titles, so a name the app itself
      // printed in a journey leg failed to resolve when typed back in.
      //
      // An exact alias outranks a partial match on the canonical name: a rider
      // typing an operator's exact wording means that stop, not a place that
      // merely contains the same letters.
      `SELECT p.*,
              MIN(CASE WHEN LOWER(a."normalizedAlias") = :exact THEN 0
                       WHEN LOWER(a.alias) = :exact THEN 0
                       ELSE 1 END) AS "aliasExact"
       FROM "places" p
       LEFT JOIN "place_aliases" a ON a."placeId" = p.id
       WHERE LOWER(p."canonicalName") LIKE :like
          OR LOWER(p."normalizedName") LIKE :like
          OR LOWER(a."normalizedAlias") LIKE :like
          OR LOWER(a.alias) LIKE :like
       GROUP BY p.id
       ORDER BY
         (LOWER(p."canonicalName") = :exact) DESC,
         (LOWER(p."normalizedName") = :exact) DESC,
         MIN(CASE WHEN LOWER(a."normalizedAlias") = :exact
                    OR LOWER(a.alias) = :exact THEN 0 ELSE 1 END) ASC,
         (LOWER(p."canonicalName") LIKE :prefix) DESC,
         (p."latitude" IS NOT NULL AND p."longitude" IS NOT NULL) DESC,
         LENGTH(p."canonicalName") ASC
       LIMIT :limit;`,
      {
        replacements: {
          like: `%${cleanName}%`,
          exact: cleanName,
          prefix: `${cleanName}%`,
          limit,
        },
        type: QueryTypes.SELECT,
      }
    );
  }

  async findPlaceByName(name: string): Promise<any | null> {
    const [best] = await this.findPlacesByName(name, 1);
    return best ?? null;
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
