import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes } from 'sequelize';
import { BusRouteModel, BusRouteStopModel, BusStopModel, BusStopTimeModel, BusTripModel, DatasetModel, DatasetVersionModel } from '../infrastructure/sequelize/models';

@Injectable()
export class BusNetworkQueryService {
  constructor(
    @InjectModel(DatasetModel)
    private readonly datasetModel: typeof DatasetModel,
    @InjectModel(DatasetVersionModel)
    private readonly datasetVersionModel: typeof DatasetVersionModel,
    @InjectModel(BusRouteModel)
    private readonly busRouteModel: typeof BusRouteModel,
    @InjectModel(BusStopModel)
    private readonly busStopModel: typeof BusStopModel,
    @InjectModel(BusRouteStopModel)
    private readonly busRouteStopModel: typeof BusRouteStopModel,
    @InjectModel(BusTripModel)
    private readonly busTripModel: typeof BusTripModel,
    @InjectModel(BusStopTimeModel)
    private readonly busStopTimeModel: typeof BusStopTimeModel,
  ) {}

  async listRoutes(
    regionSlug: string,
    filters: { search?: string; lat?: number; lng?: number; radiusKm?: number },
  ) {
    const activeVersions = await this.getActiveBusVersions(regionSlug);
    if (!activeVersions.length) {
      return [];
    }
    const providerCodes = activeVersions.map(version => version.providerCode);
    const datasetVersionIds = activeVersions.map(version => version.id);
    const where: Record<string, unknown> = {
      providerCode: { [Op.in]: providerCodes },
      datasetVersionId: { [Op.in]: datasetVersionIds },
    };

    if (filters.search) {
      where[Op.or as unknown as string] = [{ longName: { [Op.iLike]: `%${filters.search}%` } }];
    }

    // A region slug covers a whole state: 'west-bengal' includes NBSTC, whose
    // Alipurduar-Bagdogra services run 600 km from Kolkata. Given a point, only
    // routes that actually call somewhere near it are listed, so a city heading
    // does not carry the state's intercity network beneath it.
    if (Number.isFinite(filters.lat) && Number.isFinite(filters.lng)) {
      const ids = await this.routeIdsCalling(
        datasetVersionIds,
        filters.lat as number,
        filters.lng as number,
        filters.radiusKm ?? 40,
      );
      if (!ids.length) return [];
      where.id = { [Op.in]: ids };
    }

    const routes = await this.busRouteModel.findAll({
      where,
      order: [['longName', 'ASC']],
      limit: 200,
    });

    return this.oneRowPerService(routes).map(route => this.routeDto(route));
  }

  /**
   * One entry per service, not one per direction.
   *
   * Route ids are directional for several providers — BMTC pairs them with
   * routeparentid, WBBUS marks them 'UP' and 'DOWN' — so a single service
   * arrives as two rows with the same name, and a reader sees the same bus
   * listed twice with nothing to tell the entries apart.
   *
   * Collapsing on what is displayed is deliberate. directionId cannot do this
   * job: its meaning differs per provider, and grouping on WBBUS's literal
   * 'UP' would fold unrelated routes into one.
   */
  private oneRowPerService(routes: BusRouteModel[]) {
    const seen = new Set<string>();
    return routes.filter(route => {
      const shortName = String((route.metadata as { shortName?: string })?.shortName ?? '').trim();
      const key = `${route.providerCode}|${shortName.toLowerCase()}|${(route.longName ?? '').toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Ids of routes with at least one stop inside a box around a point.
   *
   * A box rather than a radius: stop coordinates live in JSONB and there is no
   * PostGIS index to lean on here, so this stays a cheap bounded scan. The
   * corners are slightly generous, which is the right way to be wrong — a route
   * wrongly kept is visible and checkable, one wrongly dropped is invisible.
   */
  private async routeIdsCalling(
    datasetVersionIds: string[],
    lat: number,
    lng: number,
    radiusKm: number,
  ): Promise<string[]> {
    const latDelta = radiusKm / 111.32;
    const lngDelta = radiusKm / (111.32 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));

    const rows = await this.busRouteModel.sequelize!.query<{ routeId: string }>(
      `SELECT DISTINCT rs."routeId"
       FROM bus_route_stops rs
       JOIN bus_stops s ON s.id = rs."stopId"
       WHERE rs."datasetVersionId" IN (:datasetVersionIds)
         AND (s.metadata->>'latitude') ~ '^-?[0-9.]+$'
         AND (s.metadata->>'longitude') ~ '^-?[0-9.]+$'
         AND (s.metadata->>'latitude')::float BETWEEN :minLat AND :maxLat
         AND (s.metadata->>'longitude')::float BETWEEN :minLng AND :maxLng`,
      {
        replacements: {
          datasetVersionIds,
          minLat: lat - latDelta,
          maxLat: lat + latDelta,
          minLng: lng - lngDelta,
          maxLng: lng + lngDelta,
        },
        type: QueryTypes.SELECT,
      },
    );

    return rows.map(row => row.routeId);
  }

  async getRoute(regionSlug: string, id: string) {
    const activeVersions = await this.getActiveBusVersions(regionSlug);
    if (!activeVersions.length) {
      throw new NotFoundException(`Bus network is not available for region "${regionSlug}" yet.`);
    }
    const providerCodes = activeVersions.map(version => version.providerCode);
    const datasetVersionIds = activeVersions.map(version => version.id);
    const route = await this.busRouteModel.findOne({
      where: {
        providerCode: { [Op.in]: providerCodes },
        datasetVersionId: { [Op.in]: datasetVersionIds },
        [Op.or]: [{ id }, { externalId: id }],
      },
    });

    if (!route) {
      throw new NotFoundException(`Bus route "${id}" was not found`);
    }

    const routeStops = await this.busRouteStopModel.findAll({
      where: {
        routeId: route.id,
        datasetVersionId: route.datasetVersionId,
      },
      order: [['sequence', 'ASC']],
    });
    const stops = await this.busStopModel.findAll({
      where: {
        id: routeStops.map(routeStop => routeStop.stopId),
      },
    });
    const stopsById = new Map(stops.map(stop => [stop.id, stop]));
    const trips = await this.busTripModel.findAll({
      where: {
        routeId: route.id,
        datasetVersionId: route.datasetVersionId,
      },
      order: [['externalId', 'ASC']],
    });

    return {
      ...this.routeDto(route),
      stops: routeStops.map(routeStop => ({
        sequence: routeStop.sequence,
        stop: this.stopDto(stopsById.get(routeStop.stopId)),
      })),
      trips: await Promise.all(trips.map(trip => this.tripDto(trip))),
    };
  }

  async listStops(regionSlug: string, filters: { search?: string }) {
    const activeVersions = await this.getActiveBusVersions(regionSlug);
    if (!activeVersions.length) {
      return [];
    }
    const providerCodes = activeVersions.map(version => version.providerCode);
    const datasetVersionIds = activeVersions.map(version => version.id);
    const where: Record<string, unknown> = {
      providerCode: { [Op.in]: providerCodes },
      datasetVersionId: { [Op.in]: datasetVersionIds },
    };

    if (filters.search) {
      where[Op.or as unknown as string] = [
        { name: { [Op.iLike]: `%${filters.search}%` } },
        { normalizedName: { [Op.iLike]: `%${filters.search.toLowerCase()}%` } },
      ];
    }

    const stops = await this.busStopModel.findAll({
      where,
      order: [['name', 'ASC']],
      limit: 200,
    });

    return stops.map(stop => this.stopDto(stop));
  }

  private async getActiveBusVersions(regionSlug: string) {
    const providerCodes = this.providerCodesForRegion(regionSlug);

    const datasets = await this.datasetModel.findAll({
      where: {
        providerCode: { [Op.in]: providerCodes },
      },
      order: [['updatedAt', 'DESC']],
    });

    const activeVersions = [];
    for (const providerCode of providerCodes) {
      const dataset = datasets.find(candidate => candidate.providerCode === providerCode);
      if (!dataset) {
        continue;
      }
      const activeVersion = await this.datasetVersionModel.findOne({
        where: {
          datasetId: dataset.id,
          status: 'ACTIVE',
        },
        order: [['updatedAt', 'DESC']],
      });
      if (activeVersion) {
        activeVersions.push({ id: activeVersion.id, providerCode });
      }
    }

    return activeVersions;
  }

  private providerCodesForRegion(regionSlug: string) {
    if (regionSlug === 'west-bengal') {
      return ['WBBUS', 'WBTC', 'NBSTC', 'SBSTC', 'KOLKATA_TRAM', 'WB_FERRY', 'EASTERN_RAILWAY_SUBURBAN'];
    }

    if (regionSlug === 'bengaluru') {
      return ['BMTC_OFFICIAL'];
    }

    throw new NotFoundException(`Bus network is not available for region "${regionSlug}"`);
  }

  private routeDto(route: BusRouteModel) {
    return {
      id: route.id,
      providerCode: route.providerCode,
      externalId: route.externalId,
      longName: route.longName,
      mode: route.metadata?.mode || route.metadata?.routeType || 'BUS',
      directionId: route.directionId,
      operationalStatus: route.operationalStatus,
      metadata: route.metadata,
      datasetVersionId: route.datasetVersionId,
    };
  }

  private stopDto(stop: BusStopModel) {
    return {
      id: stop.id,
      providerCode: stop.providerCode,
      externalId: stop.externalId,
      name: stop.name,
      normalizedName: stop.normalizedName,
      metadata: stop.metadata,
      datasetVersionId: stop.datasetVersionId,
    };
  }

  private async tripDto(trip: BusTripModel) {
    const stopTimes = await this.busStopTimeModel.findAll({
      where: {
        tripId: trip.id,
        datasetVersionId: trip.datasetVersionId,
      },
      order: [['sequence', 'ASC']],
    });

    return {
      id: trip.id,
      externalId: trip.externalId,
      direction: trip.direction,
      vehicleRegistration: trip.vehicleRegistration,
      vehicleName: trip.vehicleName,
      stopTimes: stopTimes.map(stopTime => ({
        sequence: stopTime.sequence,
        stopId: stopTime.stopId,
        arrivalTime: stopTime.arrivalTime,
        departureTime: stopTime.departureTime,
      })),
    };
  }
}
