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
    const activeVersion = await this.getActiveBusVersion(regionSlug);
    if (!activeVersion) {
      return [];
    }
    const providerCode = this.providerCodeForRegion(regionSlug);
    const where: Record<string, unknown> = {
      providerCode,
      datasetVersionId: activeVersion.id,
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
    const activeVersion = await this.getActiveBusVersion(regionSlug);
    if (!activeVersion) {
      throw new NotFoundException(`Bus network is not available for region "${regionSlug}" yet.`);
    }
    const providerCode = this.providerCodeForRegion(regionSlug);
    const route = await this.busRouteModel.findOne({
      where: {
        providerCode,
        datasetVersionId: activeVersion.id,
        [Op.or]: [{ id }, { externalId: id }],
      },
    });

    if (!route) {
      throw new NotFoundException(`Bus route "${id}" was not found`);
    }

    const routeStops = await this.busRouteStopModel.findAll({
      where: {
        routeId: route.id,
        datasetVersionId: activeVersion.id,
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
        datasetVersionId: activeVersion.id,
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
    const activeVersion = await this.getActiveBusVersion(regionSlug);
    if (!activeVersion) {
      return [];
    }
    const providerCode = this.providerCodeForRegion(regionSlug);
    const where: Record<string, unknown> = {
      providerCode,
      datasetVersionId: activeVersion.id,
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

  private async getActiveBusVersion(regionSlug: string) {
    const providerCode = this.providerCodeForRegion(regionSlug);

    const dataset = await this.datasetModel.findOne({
      where: {
        providerCode,
      },
      order: [['updatedAt', 'DESC']],
    });

    if (!dataset) {
      return null;
    }

    const activeVersion = await this.datasetVersionModel.findOne({
      where: {
        datasetId: dataset.id,
        status: 'ACTIVE',
      },
      order: [['updatedAt', 'DESC']],
    });

    if (!activeVersion) {
      return null;
    }

    return activeVersion;
  }

  private providerCodeForRegion(regionSlug: string) {
    if (regionSlug === 'west-bengal') {
      return 'WBBUS';
    }

    if (regionSlug === 'bengaluru') {
      return 'BMTC_OFFICIAL';
    }

    throw new NotFoundException(`Bus network is not available for region "${regionSlug}"`);
  }

  private routeDto(route: BusRouteModel) {
    return {
      id: route.id,
      externalId: route.externalId,
      longName: route.longName,
      directionId: route.directionId,
      operationalStatus: route.operationalStatus,
      metadata: route.metadata,
      datasetVersionId: route.datasetVersionId,
    };
  }

  private stopDto(stop: BusStopModel) {
    return {
      id: stop.id,
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
