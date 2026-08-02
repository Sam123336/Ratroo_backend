import { Injectable } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';

function isUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

@Injectable()
export class VillageRepository {
  constructor(private readonly sequelize: Sequelize) {}

  async findPlaceByIdOrName(id: string): Promise<any | null> {
    if (isUuid(id)) {
      const res = await this.sequelize.query(
        `SELECT * FROM "places" WHERE id = :id LIMIT 1;`,
        { replacements: { id }, type: QueryTypes.SELECT }
      );
      if (res.length > 0) return res[0];
    }

    const cleanId = id.replace(/_/g, ' ').toLowerCase();
    const searchRes: any[] = await this.sequelize.query(
      `SELECT * FROM "places" WHERE LOWER("canonicalName") LIKE :query OR LOWER("normalizedName") LIKE :query LIMIT 1;`,
      {
        replacements: { query: `%${cleanId}%` },
        type: QueryTypes.SELECT,
      }
    );
    
    if (searchRes.length > 0) return searchRes[0];
    return null;
  }

  async findCandidatePlacesNear(lat: number, lon: number): Promise<any[]> {
    return this.sequelize.query(
      `SELECT * FROM "places" 
       WHERE "latitude" BETWEEN :minLat AND :maxLat
         AND "longitude" BETWEEN :minLon AND :maxLon
       LIMIT 200;`,
      { 
        replacements: { 
          minLat: lat - 0.5, maxLat: lat + 0.5, 
          minLon: lon - 0.5, maxLon: lon + 0.5 
        }, 
        type: QueryTypes.SELECT 
      }
    );
  }

  async findCandidatePlacesDefault(): Promise<any[]> {
    return this.sequelize.query(
      `SELECT * FROM "places" 
       WHERE "latitude" BETWEEN 21.5 AND 27.5
         AND "longitude" BETWEEN 85.8 AND 89.9
       LIMIT 200;`,
      { type: QueryTypes.SELECT }
    );
  }

  async countAvailableRoutes(stopId: string): Promise<number> {
    const res: Array<{ count: string }> = await this.sequelize.query(
      `SELECT COUNT(DISTINCT r."id") as count
       FROM "bus_routes" r
       JOIN "bus_route_stops" rs ON rs."routeId" = r."id"
       JOIN "bus_stops" s ON s."id" = rs."stopId"
       WHERE s."placeId" = :stopId;`,
      {
        replacements: { stopId },
        type: QueryTypes.SELECT,
      }
    );
    return parseInt(res[0]?.count || '0', 10);
  }

  async getAvailableRoutes(stopId: string): Promise<Array<{ routeId: string; name: string; providerCode: string }>> {
    return this.sequelize.query(
      `SELECT DISTINCT r."id" as "routeId", r."longName" as "name", r."providerCode"
       FROM "bus_routes" r
       JOIN "bus_route_stops" rs ON rs."routeId" = r."id"
       JOIN "bus_stops" s ON s."id" = rs."stopId"
       WHERE s."placeId" = :stopId
       LIMIT 10;`,
      {
        replacements: { stopId },
        type: QueryTypes.SELECT,
      }
    );
  }
}
