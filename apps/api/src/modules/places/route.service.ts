import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { BusRouteModel, BusStopModel, BusRouteStopModel } from '../provider-ingestion/infrastructure/sequelize/models/bus-network.model';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';

function isUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

@Injectable()
export class RouteService {
  constructor(
    @InjectModel(BusRouteModel)
    private readonly busRouteModel: typeof BusRouteModel,
    @InjectModel(BusStopModel)
    private readonly busStopModel: typeof BusStopModel,
    @InjectModel(BusRouteStopModel)
    private readonly busRouteStopModel: typeof BusRouteStopModel,
    private readonly sequelize: Sequelize
  ) {}

  async getRouteById(id: string) {
    let route: BusRouteModel | null = null;

    if (isUuid(id)) {
      route = await this.busRouteModel.findOne({ where: { id } });
    }

    if (!route) {
      route = await this.busRouteModel.findOne({ where: { externalId: id } });
    }

    if (!route) {
      const searchRes: any[] = await this.sequelize.query(
        `SELECT * FROM "bus_routes" WHERE LOWER("longName") LIKE :q LIMIT 1;`,
        { replacements: { q: `%${id.toLowerCase()}%` }, type: QueryTypes.SELECT }
      );
      if (searchRes.length > 0) {
        route = searchRes[0];
      }
    }

    if (!route) {
      throw new NotFoundException(`Bus route with ID or query '${id}' not found in database.`);
    }

    const stops: Array<{ name: string; sequence: number; stopId: string }> = await this.sequelize.query(
      `SELECT p."id" as "stopId", p."canonicalName" as "name", rs."sequence"
       FROM "bus_route_stops" rs
       JOIN "bus_stops" s ON s."id" = rs."stopId"
       JOIN "places" p ON p."id" = s."placeId"
       WHERE rs."routeId" = :routeId
       ORDER BY rs."sequence" ASC;`,
      {
        replacements: { routeId: route.id },
        type: QueryTypes.SELECT,
      }
    );

    const trips: Array<{ vehicleName?: string; departureTime?: string }> = await this.sequelize.query(
      `SELECT t."vehicleName", st."departureTime"
       FROM "bus_trips" t
       LEFT JOIN "bus_stop_times" st ON st."tripId" = t."id" AND st."sequence" = 1
       WHERE t."routeId" = :routeId;`,
      {
        replacements: { routeId: route.id },
        type: QueryTypes.SELECT,
      }
    );

    return {
      id: route.id,
      externalId: route.externalId,
      providerCode: route.providerCode,
      shortName: (route.metadata as any)?.shortName || null,
      longName: route.longName,
      operationalStatus: route.operationalStatus,
      datasetVersionId: route.datasetVersionId,
      operator: (route.metadata as any)?.agency || (trips[0]?.vehicleName) || null,
      fareINR: (route.metadata as any)?.fareINR || null,
      trips,
      intermediateStops: stops.map((s) => ({
        stopId: s.stopId, // This is now placeId
        name: s.name,
        sequence: s.sequence,
      })),
    };
  }

  async findRoutesPassingStop(stopId: string) {
    if (!isUuid(stopId)) return [];
    
    // Assume stopId passed from UI is now a Place ID (canonical)
    const routes: Array<{ id: string; longName: string; providerCode: string }> = await this.sequelize.query(
      `SELECT DISTINCT r."id", r."longName", r."providerCode"
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

    return routes;
  }
}
