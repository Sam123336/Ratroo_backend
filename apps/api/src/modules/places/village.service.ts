import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { BusStopModel, BusRouteModel, BusRouteStopModel } from '../provider-ingestion/infrastructure/sequelize/models/bus-network.model';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';
import { NearestStopEngine } from './nearest-stop.engine';

function isUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

@Injectable()
export class VillageService {
  constructor(
    @InjectModel(BusStopModel)
    private readonly busStopModel: typeof BusStopModel,
    @InjectModel(BusRouteModel)
    private readonly busRouteModel: typeof BusRouteModel,
    private readonly nearestStopEngine: NearestStopEngine,
    private readonly sequelize: Sequelize
  ) {}

  async getVillageCoverageById(id: string) {
    const cleanId = id.replace(/_/g, ' ').toLowerCase();
    let villageStop: BusStopModel | null = null;

    if (isUuid(id)) {
      villageStop = await this.busStopModel.findOne({ where: { id } });
    }

    if (!villageStop) {
      const searchRes: any[] = await this.sequelize.query(
        `SELECT * FROM "bus_stops" WHERE LOWER("name") LIKE :query OR LOWER("normalizedName") LIKE :query LIMIT 1;`,
        {
          replacements: { query: `%${cleanId}%` },
          type: QueryTypes.SELECT,
        }
      );
      if (searchRes.length > 0) {
        villageStop = searchRes[0];
      }
    }

    if (!villageStop) {
      villageStop = await this.busStopModel.findOne({
        order: [['createdAt', 'DESC']],
      });
    }

    if (!villageStop) {
      throw new NotFoundException(`Village or stop '${id}' not found in database.`);
    }

    const allStops = await this.busStopModel.findAll({ limit: 100 });

    const nearestRes = this.nearestStopEngine.findNearestStop(
      villageStop.name,
      (villageStop.metadata as any)?.latitude || 22.8600,
      (villageStop.metadata as any)?.longitude || 87.9700,
      allStops.map((s) => ({
        externalId: s.id,
        providerCode: s.providerCode as any,
        nodeType: 'BUS_STOP',
        name: s.name,
        normalizedName: s.normalizedName,
        aliases: [],
        latitude: (s.metadata as any)?.latitude || 22.8600,
        longitude: (s.metadata as any)?.longitude || 87.9700,
        geography: { countryCode: 'IN' as const, stateCode: 'WB' },
        confidence: 0.90,
      }))
    );

    const routesCountRes: Array<{ count: string }> = await this.sequelize.query(
      `SELECT COUNT(DISTINCT r."id") as count
       FROM "bus_routes" r
       JOIN "bus_route_stops" rs ON rs."routeId" = r."id"
       WHERE rs."stopId" = :stopId;`,
      {
        replacements: { stopId: nearestRes.nearestStop.externalId },
        type: QueryTypes.SELECT,
      }
    );

    const availableBuses: Array<{ routeId: string; name: string; providerCode: string }> = await this.sequelize.query(
      `SELECT DISTINCT r."id" as "routeId", r."longName" as "name", r."providerCode"
       FROM "bus_routes" r
       JOIN "bus_route_stops" rs ON rs."routeId" = r."id"
       WHERE rs."stopId" = :stopId
       LIMIT 10;`,
      {
        replacements: { stopId: nearestRes.nearestStop.externalId },
        type: QueryTypes.SELECT,
      }
    );

    return {
      villageId: id,
      villageName: villageStop.name,
      gramPanchayat: (villageStop.metadata as any)?.gramPanchayat || 'Gram Panchayat',
      block: (villageStop.metadata as any)?.block || 'Block',
      district: (villageStop.metadata as any)?.district || 'Hooghly',
      state: 'West Bengal',
      nearestStop: {
        id: nearestRes.nearestStop.externalId,
        name: nearestRes.nearestStop.name,
        providerCode: nearestRes.nearestStop.providerCode,
      },
      distanceKm: nearestRes.distanceKm,
      walkingTimeMinutes: nearestRes.walkingTimeMinutes,
      availableRoutesCount: parseInt(routesCountRes[0]?.count || '0', 10),
      availableBuses,
    };
  }

  async getNearestStopForLocation(id: string) {
    const village = await this.getVillageCoverageById(id);
    return {
      locationId: id,
      locationName: village.villageName,
      nearestStop: village.nearestStop,
      distanceKm: village.distanceKm,
      walkingTimeMinutes: village.walkingTimeMinutes,
    };
  }
}
