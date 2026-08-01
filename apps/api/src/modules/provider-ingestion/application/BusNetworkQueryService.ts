import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
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

  async listRoutes(regionSlug: string, filters: { search?: string }) {
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

    const routes = await this.busRouteModel.findAll({
      where,
      order: [['longName', 'ASC']],
      limit: 200,
    });

    return routes.map(route => this.routeDto(route));
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
