import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import {
  BusRouteModel,
  BusRouteStopModel,
  BusStopModel,
  DatasetModel,
  DatasetVersionModel,
  MetroLineModel,
  MetroLineStationModel,
  MetroStationModel,
} from '../infrastructure/sequelize/models';

type MobilityMode = 'BUS' | 'METRO' | 'WALK';

interface ActiveVersions {
  bus?: DatasetVersionModel;
  metro?: DatasetVersionModel;
}

export interface StopCandidate {
  id: string;
  type: 'BUS_STOP';
  mode: 'BUS';
  name: string;
  normalizedName: string;
  metadata: Record<string, unknown>;
}

export interface StationCandidate {
  id: string;
  type: 'METRO_STATION';
  mode: 'METRO';
  name: string;
  normalizedName: string;
  isInterchange: boolean;
  metadata: Record<string, unknown>;
}

type NodeCandidate = StopCandidate | StationCandidate;

interface TransitLeg {
  mode: MobilityMode;
  routeId?: string;
  routeName?: string;
  providerCode?: string;
  from: NodeCandidate;
  to: NodeCandidate;
  fromSequence?: number;
  toSequence?: number;
  stopCount?: number;
  estimatedMinutes: number;
  instruction: string;
}

interface TransferPair {
  busStop: StopCandidate;
  metroStation: StationCandidate;
  confidence: number;
}

@Injectable()
export class BengaluruJourneyPlannerService {
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
    @InjectModel(MetroLineModel)
    private readonly metroLineModel: typeof MetroLineModel,
    @InjectModel(MetroStationModel)
    private readonly metroStationModel: typeof MetroStationModel,
    @InjectModel(MetroLineStationModel)
    private readonly metroLineStationModel: typeof MetroLineStationModel,
  ) {}

  async plan(regionSlug: string, input: { from?: string; to?: string; limit?: number }) {
    this.assertBengaluru(regionSlug);
    const from = (input.from || '').trim();
    const to = (input.to || '').trim();

    if (from.length < 2 || to.length < 2) {
      throw new NotFoundException('Journey planning requires from and to search text.');
    }

    const versions = await this.activeVersions();
    const [originCandidates, destinationCandidates] = await Promise.all([
      this.resolveCandidates(from, versions),
      this.resolveCandidates(to, versions),
    ]);

    if (!originCandidates.length || !destinationCandidates.length) {
      return {
        regionSlug: 'bengaluru',
        query: { from, to },
        originCandidates,
        destinationCandidates,
        itineraries: [],
        warnings: ['No matching origin or destination node was found in the active Bengaluru datasets.'],
      };
    }

    const transferPairs = await this.transferPairs(versions);
    const busLegs = await this.directBusLegs(
      versions,
      originCandidates.filter(this.isBusStop),
      destinationCandidates.filter(this.isBusStop),
    );
    const metroLegs = await this.directMetroLegs(
      versions,
      originCandidates.filter(this.isMetroStation),
      destinationCandidates.filter(this.isMetroStation),
    );
    const directItineraries = [
      ...busLegs.map(leg => this.itinerary([leg], 0.78)),
      ...metroLegs.map(leg => this.itinerary([leg], 0.86)),
    ];
    const transferItineraries = directItineraries.length
      ? []
      : [
          ...(await this.busToMetroItineraries(
            versions,
            originCandidates.filter(this.isBusStop),
            destinationCandidates.filter(this.isMetroStation),
            transferPairs,
          )),
          ...(await this.metroToBusItineraries(
            versions,
            originCandidates.filter(this.isMetroStation),
            destinationCandidates.filter(this.isBusStop),
            transferPairs,
          )),
        ];

    const itineraries = [...directItineraries, ...transferItineraries]
      .sort((left, right) => left.estimatedMinutes - right.estimatedMinutes || left.transferCount - right.transferCount)
      .slice(0, Math.min(Math.max(input.limit || 5, 1), 10));

    return {
      regionSlug: 'bengaluru',
      query: { from, to },
      originCandidates,
      destinationCandidates,
      itineraries,
      warnings: [
        'Journey Engine MVP uses stop order and name-based metro-bus transfer matching. OSM walking edges are not active yet.',
      ],
    };
  }

  private async directBusLegs(versions: ActiveVersions, origins: StopCandidate[], destinations: StopCandidate[]) {
    if (!versions.bus || !origins.length || !destinations.length) {
      return [];
    }

    const originRouteStops = await this.busRouteStopModel.findAll({
      where: { datasetVersionId: versions.bus.id, stopId: origins.map(stop => stop.id) },
    });
    const destinationRouteStops = await this.busRouteStopModel.findAll({
      where: { datasetVersionId: versions.bus.id, stopId: destinations.map(stop => stop.id) },
    });

    return this.matchBusLegs(versions.bus.id, origins, destinations, originRouteStops, destinationRouteStops);
  }

  private async directMetroLegs(versions: ActiveVersions, origins: StationCandidate[], destinations: StationCandidate[]) {
    if (!versions.metro || !origins.length || !destinations.length) {
      return [];
    }

    const originLineStations = await this.metroLineStationModel.findAll({
      where: { datasetVersionId: versions.metro.id, stationId: origins.map(station => station.id) },
    });
    const destinationLineStations = await this.metroLineStationModel.findAll({
      where: { datasetVersionId: versions.metro.id, stationId: destinations.map(station => station.id) },
    });

    return this.matchMetroLegs(versions.metro.id, origins, destinations, originLineStations, destinationLineStations);
  }

  private async busToMetroItineraries(
    versions: ActiveVersions,
    origins: StopCandidate[],
    destinations: StationCandidate[],
    transfers: TransferPair[],
  ) {
    if (!versions.bus || !versions.metro || !origins.length || !destinations.length || !transfers.length) {
      return [];
    }

    const busLegs = await this.directBusLegs(
      versions,
      origins,
      transfers.map(transfer => transfer.busStop),
    );
    const metroLegs = await this.directMetroLegs(
      versions,
      transfers.map(transfer => transfer.metroStation),
      destinations,
    );

    return this.combineTransferLegs(busLegs, metroLegs, transfers, 'BUS_TO_METRO');
  }

  private async metroToBusItineraries(
    versions: ActiveVersions,
    origins: StationCandidate[],
    destinations: StopCandidate[],
    transfers: TransferPair[],
  ) {
    if (!versions.bus || !versions.metro || !origins.length || !destinations.length || !transfers.length) {
      return [];
    }

    const metroLegs = await this.directMetroLegs(
      versions,
      origins,
      transfers.map(transfer => transfer.metroStation),
    );
    const busLegs = await this.directBusLegs(
      versions,
      transfers.map(transfer => transfer.busStop),
      destinations,
    );

    return this.combineTransferLegs(metroLegs, busLegs, transfers, 'METRO_TO_BUS');
  }

  private combineTransferLegs(firstLegs: TransitLeg[], secondLegs: TransitLeg[], transfers: TransferPair[], transferType: string) {
    const pairsByBusId = new Map(transfers.map(transfer => [transfer.busStop.id, transfer]));
    const pairsByStationId = new Map(transfers.map(transfer => [transfer.metroStation.id, transfer]));
    const itineraries = [];

    for (const first of firstLegs) {
      for (const second of secondLegs) {
        const transfer = this.sharedTransfer(first, second, pairsByBusId, pairsByStationId);
        if (!transfer) {
          continue;
        }

        itineraries.push(
          this.itinerary(
            [
              first,
              {
                mode: 'WALK',
                from: transfer.busStop,
                to: transfer.metroStation,
                estimatedMinutes: 4,
                instruction: `Walk transfer between ${transfer.busStop.name} and ${transfer.metroStation.name}.`,
              },
              second,
            ],
            Math.min(0.82, transfer.confidence),
            transferType,
          ),
        );
      }
    }

    return itineraries;
  }

  private sharedTransfer(
    first: TransitLeg,
    second: TransitLeg,
    pairsByBusId: Map<string, TransferPair>,
    pairsByStationId: Map<string, TransferPair>,
  ) {
    if (first.to.type === 'BUS_STOP' && second.from.type === 'METRO_STATION') {
      const transfer = pairsByBusId.get(first.to.id);
      return transfer?.metroStation.id === second.from.id ? transfer : null;
    }

    if (first.to.type === 'METRO_STATION' && second.from.type === 'BUS_STOP') {
      const transfer = pairsByStationId.get(first.to.id);
      return transfer?.busStop.id === second.from.id ? transfer : null;
    }

    return null;
  }

  private async matchBusLegs(
    datasetVersionId: string,
    origins: StopCandidate[],
    destinations: StopCandidate[],
    originRouteStops: BusRouteStopModel[],
    destinationRouteStops: BusRouteStopModel[],
  ) {
    const originsById = new Map(origins.map(stop => [stop.id, stop]));
    const destinationsById = new Map(destinations.map(stop => [stop.id, stop]));
    const routeIds = Array.from(new Set(originRouteStops.map(routeStop => routeStop.routeId)));
    const routes = routeIds.length
      ? await this.busRouteModel.findAll({ where: { id: routeIds, datasetVersionId } })
      : [];
    const routesById = new Map(routes.map(route => [route.id, route]));
    const legs: TransitLeg[] = [];

    for (const origin of originRouteStops) {
      for (const destination of destinationRouteStops) {
        if (origin.routeId !== destination.routeId || origin.sequence >= destination.sequence) {
          continue;
        }

        const route = routesById.get(origin.routeId);
        const from = originsById.get(origin.stopId);
        const to = destinationsById.get(destination.stopId);
        if (!route || !from || !to) {
          continue;
        }

        const stopCount = destination.sequence - origin.sequence;
        legs.push({
          mode: 'BUS',
          routeId: route.id,
          routeName: route.longName,
          providerCode: route.providerCode,
          from,
          to,
          fromSequence: origin.sequence,
          toSequence: destination.sequence,
          stopCount,
          estimatedMinutes: Math.max(8, stopCount * 3),
          instruction: `Take ${route.metadata?.shortName || route.longName} from ${from.name} to ${to.name}.`,
        });
      }
    }

    return legs;
  }

  private async matchMetroLegs(
    datasetVersionId: string,
    origins: StationCandidate[],
    destinations: StationCandidate[],
    originLineStations: MetroLineStationModel[],
    destinationLineStations: MetroLineStationModel[],
  ) {
    const originsById = new Map(origins.map(station => [station.id, station]));
    const destinationsById = new Map(destinations.map(station => [station.id, station]));
    const lineIds = Array.from(new Set(originLineStations.map(lineStation => lineStation.lineId)));
    const lines = lineIds.length
      ? await this.metroLineModel.findAll({ where: { id: lineIds, datasetVersionId } })
      : [];
    const linesById = new Map(lines.map(line => [line.id, line]));
    const legs: TransitLeg[] = [];

    for (const origin of originLineStations) {
      for (const destination of destinationLineStations) {
        if (origin.lineId !== destination.lineId || origin.sequence === destination.sequence) {
          continue;
        }

        const line = linesById.get(origin.lineId);
        const from = originsById.get(origin.stationId);
        const to = destinationsById.get(destination.stationId);
        if (!line || !from || !to) {
          continue;
        }

        const stopCount = Math.abs(destination.sequence - origin.sequence);
        legs.push({
          mode: 'METRO',
          routeId: line.id,
          routeName: line.name,
          providerCode: line.providerCode,
          from,
          to,
          fromSequence: origin.sequence,
          toSequence: destination.sequence,
          stopCount,
          estimatedMinutes: Math.max(6, stopCount * 2 + 3),
          instruction: `Take ${line.name} from ${from.name} to ${to.name}.`,
        });
      }
    }

    return legs;
  }

  private itinerary(legs: TransitLeg[], confidence: number, transferType = 'DIRECT') {
    const modes = Array.from(new Set(legs.map(leg => leg.mode)));
    const estimatedMinutes = legs.reduce((total, leg) => total + leg.estimatedMinutes, 0);
    const transitLegCount = legs.filter(leg => leg.mode !== 'WALK').length;

    return {
      id: `journey:${legs.map(leg => `${leg.mode}:${leg.routeId || leg.from.id}:${leg.to.id}`).join('|')}`,
      transferType,
      modes,
      transferCount: Math.max(0, transitLegCount - 1),
      estimatedMinutes,
      confidence,
      summary: legs.map(leg => leg.instruction).join(' '),
      legs,
    };
  }

  private async transferPairs(versions: ActiveVersions) {
    if (!versions.bus || !versions.metro) {
      return [];
    }

    const [busStops, metroStations] = await Promise.all([
      this.busStopModel.findAll({
        where: { providerCode: 'BMTC_OFFICIAL', datasetVersionId: versions.bus.id },
        order: [['name', 'ASC']],
      }),
      this.metroStationModel.findAll({
        where: { providerCode: 'BMRCL_METRO', datasetVersionId: versions.metro.id },
        order: [['name', 'ASC']],
      }),
    ]);

    const stops = busStops.map(stop => this.busStopCandidate(stop));
    const stations = metroStations.map(station => this.metroStationCandidate(station));
    const transfers: TransferPair[] = [];

    for (const station of stations) {
      const stationKey = this.transferKey(station.normalizedName);
      if (!stationKey || stationKey.length < 4) {
        continue;
      }

      for (const stop of stops) {
        const stopKey = this.transferKey(stop.normalizedName);
        if (stopKey === stationKey) {
          transfers.push({ busStop: stop, metroStation: station, confidence: 0.8 });
        }
      }
    }

    return transfers;
  }

  private async resolveCandidates(query: string, versions: ActiveVersions) {
    const term = query.trim();
    const normalizedTerm = this.normalize(term);
    const [busStops, metroStations] = await Promise.all([
      versions.bus
        ? this.busStopModel.findAll({
            where: {
              providerCode: 'BMTC_OFFICIAL',
              datasetVersionId: versions.bus.id,
              [Op.or]: [{ name: { [Op.iLike]: `%${term}%` } }, { normalizedName: { [Op.iLike]: `%${normalizedTerm}%` } }],
            },
            order: [['name', 'ASC']],
            limit: 8,
          })
        : [],
      versions.metro
        ? this.metroStationModel.findAll({
            where: {
              providerCode: 'BMRCL_METRO',
              datasetVersionId: versions.metro.id,
              [Op.or]: [{ name: { [Op.iLike]: `%${term}%` } }, { normalizedName: { [Op.iLike]: `%${normalizedTerm}%` } }],
            },
            order: [['name', 'ASC']],
            limit: 8,
          })
        : [],
    ]);

    return [
      ...metroStations.map(station => this.metroStationCandidate(station)),
      ...busStops.map(stop => this.busStopCandidate(stop)),
    ];
  }

  private async activeVersions(): Promise<ActiveVersions> {
    const [bus, metro] = await Promise.all([this.activeVersion('BMTC_OFFICIAL'), this.activeVersion('BMRCL_METRO')]);

    return { bus, metro };
  }

  private async activeVersion(providerCode: string) {
    const dataset = await this.datasetModel.findOne({ where: { providerCode }, order: [['updatedAt', 'DESC']] });
    if (!dataset) {
      return undefined;
    }

    return this.datasetVersionModel.findOne({
      where: { datasetId: dataset.id, status: 'ACTIVE' },
      order: [['updatedAt', 'DESC']],
    });
  }

  private busStopCandidate(stop: BusStopModel): StopCandidate {
    return {
      id: stop.id,
      type: 'BUS_STOP',
      mode: 'BUS',
      name: stop.name,
      normalizedName: stop.normalizedName,
      metadata: stop.metadata,
    };
  }

  private metroStationCandidate(station: MetroStationModel): StationCandidate {
    return {
      id: station.id,
      type: 'METRO_STATION',
      mode: 'METRO',
      name: station.name,
      normalizedName: station.normalizedName,
      isInterchange: station.isInterchange,
      metadata: station.metadata,
    };
  }

  private isBusStop(candidate: NodeCandidate): candidate is StopCandidate {
    return candidate.type === 'BUS_STOP';
  }

  private isMetroStation(candidate: NodeCandidate): candidate is StationCandidate {
    return candidate.type === 'METRO_STATION';
  }

  private transferKey(value: string) {
    const normalized = this.normalize(value)
      .replace(/\bmetro\b/g, '')
      .replace(/\bstation\b/g, '')
      .replace(/\bbus\b/g, '')
      .replace(/\bstand\b/g, '')
      .replace(/\bplatform\b/g, '')
      .replace(/\bkbs\b/g, 'majestic')
      .replace(/\bkempegowda\b/g, 'majestic')
      .trim();

    return Array.from(new Set(normalized.split(' ').filter(Boolean))).join(' ');
  }

  private normalize(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private assertBengaluru(regionSlug: string) {
    if (regionSlug !== 'bengaluru') {
      throw new NotFoundException(`Journey planning is not available for region "${regionSlug}" yet.`);
    }
  }
}
