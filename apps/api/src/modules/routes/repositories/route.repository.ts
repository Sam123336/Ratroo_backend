import { Injectable } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';
import { InjectModel } from '@nestjs/sequelize';
import { BusRouteModel } from '../../provider-ingestion/infrastructure/sequelize/models/bus-network.model';

function isUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

@Injectable()
export class RouteRepository {
  constructor(
    @InjectModel(BusRouteModel)
    private readonly busRouteModel: typeof BusRouteModel,
    private readonly sequelize: Sequelize
  ) {}

  async findRoute(id: string): Promise<BusRouteModel | null> {
    if (isUuid(id)) {
      const route = await this.busRouteModel.findOne({ where: { id } });
      if (route) return route;
    }
    
    let route = await this.busRouteModel.findOne({ where: { externalId: id } });
    if (route) return route;

    const searchRes: any[] = await this.sequelize.query(
      `SELECT * FROM "bus_routes" WHERE LOWER("longName") LIKE :q LIMIT 1;`,
      { replacements: { q: `%${id.toLowerCase()}%` }, type: QueryTypes.SELECT }
    );

    if (searchRes.length > 0) {
      // Cast raw result back to model equivalent shape or fetch it properly
      return this.busRouteModel.build(searchRes[0], { isNewRecord: false });
    }

    return null;
  }

  async getRouteStops(routeId: string): Promise<Array<{ stopId: string; name: string; sequence: number }>> {
    return this.sequelize.query(
      `SELECT p."id" as "stopId", p."canonicalName" as "name", rs."sequence"
       FROM "bus_route_stops" rs
       JOIN "bus_stops" s ON s."id" = rs."stopId"
       JOIN "places" p ON p."id" = s."placeId"
       WHERE rs."routeId" = :routeId
       ORDER BY rs."sequence" ASC;`,
      {
        replacements: { routeId },
        type: QueryTypes.SELECT,
      }
    );
  }

  async getRouteTrips(routeId: string): Promise<Array<{ vehicleName?: string; departureTime?: string }>> {
    return this.sequelize.query(
      `SELECT t."vehicleName", st."departureTime"
       FROM "bus_trips" t
       LEFT JOIN "bus_stop_times" st ON st."tripId" = t."id" AND st."sequence" = 1
       WHERE t."routeId" = :routeId;`,
      {
        replacements: { routeId },
        type: QueryTypes.SELECT,
      }
    );
  }

  async findRoutesPassingPlace(placeId: string): Promise<Array<{ id: string; longName: string; providerCode: string }>> {
    if (!isUuid(placeId)) return [];
    
    return this.sequelize.query(
      `SELECT DISTINCT r."id", r."longName", r."providerCode"
       FROM "bus_routes" r
       JOIN "bus_route_stops" rs ON rs."routeId" = r."id"
       JOIN "bus_stops" s ON s."id" = rs."stopId"
       WHERE s."placeId" = :placeId
       LIMIT 10;`,
      {
        replacements: { placeId },
        type: QueryTypes.SELECT,
      }
    );
  }
}
