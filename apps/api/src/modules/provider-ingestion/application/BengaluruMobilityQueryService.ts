import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { ProviderRegistryService } from './ProviderRegistryService';
import {
  BusRouteModel,
  BusStopModel,
  DatasetModel,
  DatasetVersionModel,
  MetroLineModel,
  MetroStationModel,
} from '../infrastructure/sequelize/models';

interface ActiveProviderSnapshot {
  providerCode: string;
  datasetId?: string;
  datasetVersionId?: string;
  status: 'ACTIVE_DATA' | 'NO_ACTIVE_DATA';
  updatedAt?: Date;
}

@Injectable()
export class BengaluruMobilityQueryService {
  constructor(
    private readonly providerRegistry: ProviderRegistryService,
    @InjectModel(DatasetModel)
    private readonly datasetModel: typeof DatasetModel,
    @InjectModel(DatasetVersionModel)
    private readonly datasetVersionModel: typeof DatasetVersionModel,
    @InjectModel(MetroLineModel)
    private readonly metroLineModel: typeof MetroLineModel,
    @InjectModel(MetroStationModel)
    private readonly metroStationModel: typeof MetroStationModel,
    @InjectModel(BusRouteModel)
    private readonly busRouteModel: typeof BusRouteModel,
    @InjectModel(BusStopModel)
    private readonly busStopModel: typeof BusStopModel,
  ) {}

  getKarnatakaRegion() {
    return {
      countryCode: 'IN',
      stateCode: 'KA',
      stateName: 'Karnataka',
      activeRegions: [
        {
          slug: 'bengaluru',
          name: 'Bengaluru',
          type: 'CITY',
          launchStatus: 'ACTIVE_DEVELOPMENT',
          modes: ['BUS', 'METRO', 'AIRPORT_BUS', 'METRO_FEEDER', 'WALK'],
        },
      ],
      backlogRegions: [],
    };
  }

  async getNetworkSummary(regionSlug: string) {
    this.assertBengaluru(regionSlug);

    const [bmrcl, bmtc] = await Promise.all([
      this.activeProviderSnapshot('BMRCL_METRO'),
      this.activeProviderSnapshot('BMTC_OFFICIAL'),
    ]);
    const [metroLineCount, metroStationCount, busRouteCount, busStopCount] = await Promise.all([
      this.countMetroLines(bmrcl.datasetVersionId),
      this.countMetroStations(bmrcl.datasetVersionId),
      this.countBusRoutes('BMTC_OFFICIAL', bmtc.datasetVersionId),
      this.countBusStops('BMTC_OFFICIAL', bmtc.datasetVersionId),
    ]);

    return {
      region: {
        slug: 'bengaluru',
        name: 'Bengaluru',
        stateCode: 'KA',
        stateName: 'Karnataka',
        countryCode: 'IN',
      },
      modes: [
        {
          mode: 'METRO',
          providerCode: 'BMRCL_METRO',
          status: bmrcl.status,
          lines: metroLineCount,
          stations: metroStationCount,
          datasetVersionId: bmrcl.datasetVersionId,
        },
        {
          mode: 'BUS',
          providerCode: 'BMTC_OFFICIAL',
          status: bmtc.status,
          routes: busRouteCount,
          stops: busStopCount,
          datasetVersionId: bmtc.datasetVersionId,
          serviceClasses: ['REGULAR', 'EXPRESS', 'LIMITED_STOP', 'AIRPORT', 'METRO_FEEDER', 'NIGHT', 'PREMIUM'],
        },
        {
          mode: 'WALK',
          providerCode: 'OSM_ROAD_NETWORK_BENGALURU',
          status: 'PLANNED',
          note: 'Walking graph will be enabled after OSM routing import.',
        },
      ],
      uiReadiness: {
        metro: bmrcl.status === 'ACTIVE_DATA',
        bus: bmtc.status === 'ACTIVE_DATA',
        search: bmrcl.status === 'ACTIVE_DATA' || bmtc.status === 'ACTIVE_DATA',
        nearby: bmtc.status === 'ACTIVE_DATA',
        journeyPlanning: bmrcl.status === 'ACTIVE_DATA' && bmtc.status === 'ACTIVE_DATA',
      },
    };
  }

  async getCoverage(regionSlug: string) {
    this.assertBengaluru(regionSlug);
    const providers = this.providerRegistry.listBengaluruProviders();
    const snapshots = await Promise.all(providers.map(provider => this.activeProviderSnapshot(provider.code)));
    const snapshotsByProvider = new Map(snapshots.map(snapshot => [snapshot.providerCode, snapshot]));

    return {
      regionSlug: 'bengaluru',
      stateCode: 'KA',
      providers: providers.map(provider => {
        const snapshot = snapshotsByProvider.get(provider.code);
        return {
          code: provider.code,
          name: provider.name,
          priority: provider.priority,
          modes: provider.modes,
          adapterStatus: provider.status,
          dataStatus: snapshot?.status || 'NO_ACTIVE_DATA',
          datasetVersionId: snapshot?.datasetVersionId,
          updatedAt: snapshot?.updatedAt,
        };
      }),
    };
  }

  async search(regionSlug: string, query: string, limit = 20) {
    this.assertBengaluru(regionSlug);
    const term = query.trim();
    if (term.length < 2) {
      return [];
    }

    const cappedLimit = Math.min(Math.max(limit, 1), 50);
    const [bmrcl, bmtc] = await Promise.all([
      this.activeProviderSnapshot('BMRCL_METRO'),
      this.activeProviderSnapshot('BMTC_OFFICIAL'),
    ]);
    const [metroStations, metroLines, busStops, busRoutes] = await Promise.all([
      this.findMetroStations(term, bmrcl.datasetVersionId, cappedLimit),
      this.findMetroLines(term, bmrcl.datasetVersionId, cappedLimit),
      this.findBusStops(term, bmtc.datasetVersionId, cappedLimit),
      this.findBusRoutes(term, bmtc.datasetVersionId, cappedLimit),
    ]);

    return [...metroStations, ...metroLines, ...busStops, ...busRoutes].slice(0, cappedLimit);
  }

  async nearby(regionSlug: string, lat: number, lng: number, limit = 20) {
    this.assertBengaluru(regionSlug);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new NotFoundException('Nearby search requires valid lat and lng values.');
    }

    const cappedLimit = Math.min(Math.max(limit, 1), 50);
    const [bmrcl, bmtc] = await Promise.all([
      this.activeProviderSnapshot('BMRCL_METRO'),
      this.activeProviderSnapshot('BMTC_OFFICIAL'),
    ]);
    const [metroStations, busStops] = await Promise.all([
      this.metroStationsWithCoordinates(bmrcl.datasetVersionId),
      this.busStopsWithCoordinates('BMTC_OFFICIAL', bmtc.datasetVersionId),
    ]);

    return [...metroStations, ...busStops]
      .map(item => ({
        ...item,
        distanceMeters: Math.round(this.distanceMeters(lat, lng, item.latitude, item.longitude)),
      }))
      .sort((left, right) => left.distanceMeters - right.distanceMeters)
      .slice(0, cappedLimit);
  }

  private async activeProviderSnapshot(providerCode: string): Promise<ActiveProviderSnapshot> {
    const dataset = await this.datasetModel.findOne({
      where: { providerCode },
      order: [['updatedAt', 'DESC']],
    });

    if (!dataset) {
      return { providerCode, status: 'NO_ACTIVE_DATA' };
    }

    const version = await this.datasetVersionModel.findOne({
      where: { datasetId: dataset.id, status: 'ACTIVE' },
      order: [['updatedAt', 'DESC']],
    });

    if (!version) {
      return { providerCode, datasetId: dataset.id, status: 'NO_ACTIVE_DATA' };
    }

    return {
      providerCode,
      datasetId: dataset.id,
      datasetVersionId: version.id,
      status: 'ACTIVE_DATA',
      updatedAt: version.updatedAt,
    };
  }

  private countMetroLines(datasetVersionId?: string) {
    return datasetVersionId ? this.metroLineModel.count({ where: { providerCode: 'BMRCL_METRO', datasetVersionId } }) : 0;
  }

  private countMetroStations(datasetVersionId?: string) {
    return datasetVersionId ? this.metroStationModel.count({ where: { providerCode: 'BMRCL_METRO', datasetVersionId } }) : 0;
  }

  private countBusRoutes(providerCode: string, datasetVersionId?: string) {
    return datasetVersionId ? this.busRouteModel.count({ where: { providerCode, datasetVersionId } }) : 0;
  }

  private countBusStops(providerCode: string, datasetVersionId?: string) {
    return datasetVersionId ? this.busStopModel.count({ where: { providerCode, datasetVersionId } }) : 0;
  }

  private async findMetroStations(term: string, datasetVersionId?: string, limit = 20) {
    if (!datasetVersionId) {
      return [];
    }

    const stations = await this.metroStationModel.findAll({
      where: {
        providerCode: 'BMRCL_METRO',
        datasetVersionId,
        [Op.or]: [{ name: { [Op.iLike]: `%${term}%` } }, { normalizedName: { [Op.iLike]: `%${term.toLowerCase()}%` } }],
      },
      order: [['name', 'ASC']],
      limit,
    });

    return stations.map(station => ({
      id: station.id,
      type: 'METRO_STATION',
      mode: 'METRO',
      providerCode: 'BMRCL_METRO',
      name: station.name,
      normalizedName: station.normalizedName,
      isInterchange: station.isInterchange,
      metadata: station.metadata,
    }));
  }

  private async findMetroLines(term: string, datasetVersionId?: string, limit = 20) {
    if (!datasetVersionId) {
      return [];
    }

    const lines = await this.metroLineModel.findAll({
      where: {
        providerCode: 'BMRCL_METRO',
        datasetVersionId,
        name: { [Op.iLike]: `%${term}%` },
      },
      order: [['name', 'ASC']],
      limit,
    });

    return lines.map(line => ({
      id: line.id,
      type: 'METRO_LINE',
      mode: 'METRO',
      providerCode: 'BMRCL_METRO',
      name: line.name,
      color: line.color,
      operationalStatus: line.operationalStatus,
    }));
  }

  private async findBusStops(term: string, datasetVersionId?: string, limit = 20) {
    if (!datasetVersionId) {
      return [];
    }

    const stops = await this.busStopModel.findAll({
      where: {
        providerCode: 'BMTC_OFFICIAL',
        datasetVersionId,
        [Op.or]: [{ name: { [Op.iLike]: `%${term}%` } }, { normalizedName: { [Op.iLike]: `%${term.toLowerCase()}%` } }],
      },
      order: [['name', 'ASC']],
      limit,
    });

    return stops.map(stop => ({
      id: stop.id,
      type: 'BUS_STOP',
      mode: 'BUS',
      providerCode: 'BMTC_OFFICIAL',
      name: stop.name,
      normalizedName: stop.normalizedName,
      metadata: stop.metadata,
    }));
  }

  private async findBusRoutes(term: string, datasetVersionId?: string, limit = 20) {
    if (!datasetVersionId) {
      return [];
    }

    const routes = await this.busRouteModel.findAll({
      where: {
        providerCode: 'BMTC_OFFICIAL',
        datasetVersionId,
        longName: { [Op.iLike]: `%${term}%` },
      },
      order: [['longName', 'ASC']],
      limit,
    });

    return routes.map(route => ({
      id: route.id,
      type: 'BUS_ROUTE',
      mode: 'BUS',
      providerCode: 'BMTC_OFFICIAL',
      name: route.longName,
      operationalStatus: route.operationalStatus,
      metadata: route.metadata,
    }));
  }

  private async metroStationsWithCoordinates(datasetVersionId?: string) {
    if (!datasetVersionId) {
      return [];
    }

    const stations = await this.metroStationModel.findAll({
      where: { providerCode: 'BMRCL_METRO', datasetVersionId },
      order: [['name', 'ASC']],
    });

    return stations
      .map(station => {
        const latitude = this.metadataNumber(station.metadata, 'latitude');
        const longitude = this.metadataNumber(station.metadata, 'longitude');

        if (latitude === undefined || longitude === undefined) {
          return null;
        }

        return {
          id: station.id,
          type: 'METRO_STATION',
          mode: 'METRO',
          providerCode: 'BMRCL_METRO',
          name: station.name,
          latitude,
          longitude,
          metadata: station.metadata,
        };
      })
      .filter(Boolean);
  }

  private async busStopsWithCoordinates(providerCode: string, datasetVersionId?: string) {
    if (!datasetVersionId) {
      return [];
    }

    const stops = await this.busStopModel.findAll({
      where: { providerCode, datasetVersionId },
      order: [['name', 'ASC']],
    });

    return stops
      .map(stop => {
        const latitude = this.metadataNumber(stop.metadata, 'latitude');
        const longitude = this.metadataNumber(stop.metadata, 'longitude');

        if (latitude === undefined || longitude === undefined) {
          return null;
        }

        return {
          id: stop.id,
          type: 'BUS_STOP',
          mode: 'BUS',
          providerCode,
          name: stop.name,
          latitude,
          longitude,
          metadata: stop.metadata,
        };
      })
      .filter(Boolean);
  }

  private metadataNumber(metadata: Record<string, unknown>, key: string) {
    const value = metadata?.[key];
    const parsed = typeof value === 'number' ? value : Number(value);

    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private distanceMeters(fromLat: number, fromLng: number, toLat: number, toLng: number) {
    const radiusMeters = 6371000;
    const dLat = this.radians(toLat - fromLat);
    const dLng = this.radians(toLng - fromLng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.radians(fromLat)) * Math.cos(this.radians(toLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

    return radiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private radians(degrees: number) {
    return (degrees * Math.PI) / 180;
  }

  private assertBengaluru(regionSlug: string) {
    if (regionSlug !== 'bengaluru') {
      throw new NotFoundException(`Karnataka mobility API is not available for region "${regionSlug}"`);
    }
  }
}
