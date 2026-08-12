import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Model, ModelCtor, Sequelize } from 'sequelize-typescript';
import { Transaction } from 'sequelize';
import {
  AgencyModel, RouteModel, StopModel, StopTimeModel, TripModel,
} from '../../transit/infrastructure/sequelize/models';
import {
  BusRouteModel, BusRouteStopModel, BusStopModel, BusStopTimeModel, BusTripModel,
} from '../infrastructure/sequelize/models';

/**
 * Projects the promoted provider-ingestion network (`bus_*`) into the canonical
 * transit serving tables (`agencies`, `stops`, `routes`, `trips`, `stop_times`)
 * that the public /v1 endpoints and the mobile app read.
 *
 * Ingestion promotes into `bus_*`; nothing filled the transit tables, so
 * /v1/routes, /v1/stops/nearby and /v1/journey were all served from empty
 * tables while the data sat one schema over. This is the missing publish step.
 *
 * Written through the Sequelize models rather than SQL: every row shape here
 * is one the ORM already describes, and going around it meant the projection
 * could write columns the models did not declare — which is how `timeSource`
 * came to exist in the database but not in `StopTimeModel`.
 *
 * Idempotent — every write is an upsert keyed on the id carried across from
 * `bus_*`, so re-running after each nightly sync converges rather than
 * duplicating.
 */
@Injectable()
export class CanonicalTransitProjectionService {
  private readonly logger = new Logger(CanonicalTransitProjectionService.name);

  /** Rows per insert. Large enough to be few round trips, small enough to hold. */
  private static readonly BATCH = 1000;

  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
    @InjectModel(BusStopModel) private readonly busStops: typeof BusStopModel,
    @InjectModel(BusRouteModel) private readonly busRoutes: typeof BusRouteModel,
    @InjectModel(BusRouteStopModel) private readonly busRouteStops: typeof BusRouteStopModel,
    @InjectModel(BusTripModel) private readonly busTrips: typeof BusTripModel,
    @InjectModel(BusStopTimeModel) private readonly busStopTimes: typeof BusStopTimeModel,
    @InjectModel(AgencyModel) private readonly agencies: typeof AgencyModel,
    @InjectModel(StopModel) private readonly stops: typeof StopModel,
    @InjectModel(RouteModel) private readonly routes: typeof RouteModel,
    @InjectModel(TripModel) private readonly trips: typeof TripModel,
    @InjectModel(StopTimeModel) private readonly stopTimes: typeof StopTimeModel,
  ) {}

  async project(): Promise<Record<string, number>> {
    const startedAt = Date.now();

    const counts = await this.sequelize.transaction(async transaction => {
      const busStops = await this.busStops.findAll({ transaction });
      const canonicalStopId = buildCanonicalStopMap(busStops);

      await this.projectAgencies(transaction);
      await this.projectStops(busStops, canonicalStopId, transaction);
      const routeIds = await this.projectRoutes(canonicalStopId, transaction);
      const tripIds = await this.projectTrips(routeIds, transaction);
      await this.projectStopTimes(tripIds, canonicalStopId, transaction);

      return this.countAll(transaction);
    });

    this.logger.log(
      `Canonical projection finished in ${Math.round((Date.now() - startedAt) / 1000)}s: ` +
        Object.entries(counts).map(([table, n]) => `${table}=${n}`).join(' '),
    );

    return counts;
  }

  /**
   * One agency per provider code. `bus_routes` has no agency concept, so the
   * provider stands in as the operator.
   */
  private async projectAgencies(transaction: Transaction): Promise<void> {
    const rows = await this.busRoutes.findAll({
      attributes: [
        [Sequelize.fn('DISTINCT', Sequelize.col('providerCode')), 'providerCode'],
      ],
      raw: true,
      transaction,
    });

    const codes = rows
      .map(row => (row as unknown as { providerCode: string }).providerCode)
      .filter(Boolean);

    // A handful of providers, so per-row upsert on the unique `code` is
    // cheaper to read than a bulk conflict clause and costs nothing here.
    for (const code of codes) {
      const existing = await this.agencies.findOne({ where: { code }, transaction });
      if (existing) {
        await existing.update({ name: code, provider: code }, { transaction });
      } else {
        await this.agencies.create(
          { name: code, code, country: 'IN', provider: code },
          { transaction },
        );
      }
    }
  }

  /** Only stops that other imports of the same place resolve to. */
  private async projectStops(
    busStops: BusStopModel[],
    canonicalStopId: Map<string, string>,
    transaction: Transaction,
  ): Promise<void> {
    const rows = busStops
      .filter(stop => canonicalStopId.get(stop.id) === stop.id)
      .map(stop => {
        const metadata = (stop.metadata ?? {}) as Record<string, unknown>;
        const geography = (metadata.geography ?? {}) as Record<string, unknown>;
        const latitude = numberOrNull(metadata.latitude);
        const longitude = numberOrNull(metadata.longitude);

        return {
          id: stop.id,
          name: truncate(stop.name, 255),
          normalizedName: truncate(stop.normalizedName, 255),
          latitude: latitude ?? undefined,
          longitude: longitude ?? undefined,
          // GEOMETRY through the ORM's own GeoJSON shape, so PostGIS stays an
          // implementation detail of the column rather than of this service.
          location:
            latitude != null && longitude != null
              ? { type: 'Point' as const, coordinates: [longitude, latitude] }
              : undefined,
          city: asString(geography.city),
          district: asString(geography.district),
          state: asString(geography.stateCode),
          provider: stop.providerCode,
          externalId: stop.externalId,
        };
      });

    await this.upsertInBatches(this.stops, rows, [
      'name', 'normalizedName', 'latitude', 'longitude', 'location',
      'city', 'district', 'state', 'updatedAt',
    ], transaction);
  }

  /**
   * Route endpoints come from the first and last stop of the route's sequence,
   * translated through the canonical map so they never point at a stop that
   * did not publish.
   */
  private async projectRoutes(
    canonicalStopId: Map<string, string>,
    transaction: Transaction,
  ): Promise<Set<string>> {
    const [busRoutes, routeStops, agencies] = await Promise.all([
      this.busRoutes.findAll({ transaction }),
      this.busRouteStops.findAll({ order: [['sequence', 'ASC']], transaction }),
      this.agencies.findAll({ transaction }),
    ]);

    const agencyIdByCode = new Map(agencies.map(agency => [agency.code, agency.id]));
    const endpoints = new Map<string, { first: string; last: string }>();
    for (const routeStop of routeStops) {
      const canonical = canonicalStopId.get(routeStop.stopId) ?? routeStop.stopId;
      const seen = endpoints.get(routeStop.routeId);
      if (!seen) endpoints.set(routeStop.routeId, { first: canonical, last: canonical });
      else seen.last = canonical;
    }

    const rows = busRoutes
      .map(route => {
        const agencyId = agencyIdByCode.get(route.providerCode);
        // A route with no agency cannot satisfy the foreign key; skipping it is
        // better than failing the whole projection.
        if (!agencyId) return null;

        const metadata = (route.metadata ?? {}) as Record<string, unknown>;
        const ends = endpoints.get(route.id);

        return {
          id: route.id,
          agencyId,
          shortName: truncate(asString(metadata.shortName), 255),
          longName: truncate(route.longName, 255) ?? route.longName,
          originStopId: ends?.first,
          destinationStopId: ends?.last,
          routeType: routeTypeFor(asString(metadata.mode), route.providerCode),
          provider: route.providerCode,
          externalId: route.externalId,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    await this.upsertInBatches(this.routes, rows, [
      'agencyId', 'shortName', 'longName', 'originStopId', 'destinationStopId',
      'routeType', 'updatedAt',
    ], transaction);

    return new Set(rows.map(row => row.id));
  }

  /** Only trips whose route projected — an orphan trip would break the FK. */
  private async projectTrips(
    routeIds: Set<string>,
    transaction: Transaction,
  ): Promise<Set<string>> {
    const busTrips = await this.busTrips.findAll({ transaction });

    const rows = busTrips
      .filter(trip => routeIds.has(trip.routeId))
      .map(trip => ({
        id: trip.id,
        routeId: trip.routeId,
        direction: trip.direction ?? 'OUTBOUND',
        vehicleName: trip.vehicleName,
        vehicleRegistration: trip.vehicleRegistration,
        provider: trip.providerCode,
        externalId: trip.externalId,
      }));

    await this.upsertInBatches(this.trips, rows, [
      'routeId', 'direction', 'vehicleName', 'vehicleRegistration', 'updatedAt',
    ], transaction);

    return new Set(rows.map(row => row.id));
  }

  private async projectStopTimes(
    tripIds: Set<string>,
    canonicalStopId: Map<string, string>,
    transaction: Transaction,
  ): Promise<void> {
    const busStopTimes = await this.busStopTimes.findAll({ transaction });
    const publishedStopIds = new Set(canonicalStopId.values());

    const rows = busStopTimes
      .map(stopTime => {
        if (!tripIds.has(stopTime.tripId)) return null;
        const stopId = canonicalStopId.get(stopTime.stopId) ?? stopTime.stopId;
        if (!publishedStopIds.has(stopId)) return null;

        return {
          id: stopTime.id,
          tripId: stopTime.tripId,
          stopId,
          stopSequence: stopTime.sequence,
          arrivalTime: stopTime.arrivalTime,
          departureTime: stopTime.departureTime,
          // Carried through, or estimates arrive indistinguishable from
          // scraped operator times.
          timeSource: (stopTime as unknown as { timeSource?: string }).timeSource,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    await this.upsertInBatches(this.stopTimes, rows, [
      'stopId', 'stopSequence', 'arrivalTime', 'departureTime', 'timeSource', 'updatedAt',
    ], transaction);
  }

  /**
   * `bulkCreate` with `updateOnDuplicate` is an upsert on the primary key,
   * which is what makes re-running the projection converge. Batched because a
   * single statement carrying 40,000 rows exceeds what the driver will bind.
   */
  private async upsertInBatches(
    model: ModelCtor<Model>,
    rows: Record<string, unknown>[],
    updateOnDuplicate: string[],
    transaction: Transaction,
  ): Promise<void> {
    for (let index = 0; index < rows.length; index += CanonicalTransitProjectionService.BATCH) {
      // Sequelize types bulkCreate against one model's creation attributes,
      // which a helper shared by five models cannot satisfy. The row shapes are
      // built from the models' own fields directly above each call.
      await model.bulkCreate(
        rows.slice(index, index + CanonicalTransitProjectionService.BATCH) as never,
        { updateOnDuplicate, transaction },
      );
    }
  }

  private async countAll(transaction: Transaction): Promise<Record<string, number>> {
    const [agencies, stops, routes, trips, stopTimes] = await Promise.all([
      this.agencies.count({ transaction }),
      this.stops.count({ transaction }),
      this.routes.count({ transaction }),
      this.trips.count({ transaction }),
      this.stopTimes.count({ transaction }),
    ]);

    return { agencies, stops, routes, trips, stop_times: stopTimes };
  }
}

/**
 * Which `bus_stops` row each one publishes as.
 *
 * Every operator import creates its own row, so one bus stand imported by
 * eight operators became eight stops, each holding a slice of the services.
 * Same-named stops in the same place now publish as one, and every reference
 * is translated through this map.
 *
 * Grid-snapped at 0.001 degrees — about 110 m. It errs toward leaving a
 * duplicate (two stops either side of a cell boundary) rather than merging two
 * stops that are not the same place: the direction that cannot hide a service.
 *
 * The survivor is the lowest id, which is stable — the same input yields the
 * same canonical id on every run, so re-projection converges instead of
 * shuffling stop ids under the app.
 */
export function buildCanonicalStopMap(busStops: BusStopModel[]): Map<string, string> {
  const survivors = new Map<string, string>();

  for (const stop of busStops) {
    const cell = gridKey(stop);
    if (!cell) continue;
    const held = survivors.get(cell);
    if (!held || stop.id < held) survivors.set(cell, stop.id);
  }

  const canonical = new Map<string, string>();
  for (const stop of busStops) {
    const cell = gridKey(stop);
    // A stop with no name key or no coordinates cannot be shown to be the same
    // place as another, so it stands alone.
    canonical.set(stop.id, cell ? (survivors.get(cell) ?? stop.id) : stop.id);
  }

  return canonical;
}

function gridKey(stop: BusStopModel): string | null {
  const metadata = (stop.metadata ?? {}) as Record<string, unknown>;
  const geography = (metadata.geography ?? {}) as Record<string, unknown>;
  const latitude = numberOrNull(metadata.latitude);
  const longitude = numberOrNull(metadata.longitude);
  const name = (stop.name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

  if (!name || latitude == null || longitude == null) return null;

  return [
    name,
    asString(geography.stateCode) ?? '',
    latitude.toFixed(3),
    longitude.toFixed(3),
  ].join('|');
}

/**
 * The route's own mode, then the provider's, then bus.
 *
 * Provider code alone was the rule, which works only while every route a
 * provider publishes shares one mode. Registered operators break that: one
 * owner runs a bus route and an auto route, and both would have projected as
 * BUS.
 */
function routeTypeFor(mode: string | undefined, providerCode: string): string {
  switch ((mode ?? '').toUpperCase()) {
    case 'TRAM': return 'TRAM';
    case 'FERRY': return 'FERRY';
    case 'METRO': return 'METRO';
    case 'SUBURBAN_RAIL': return 'RAIL';
    case 'AUTO': return 'AUTO';
    case 'SHARED_AUTO': return 'SHARED_AUTO';
    case 'BUS':
    case 'INTERCITY_BUS': return 'BUS';
  }

  switch (providerCode) {
    case 'KOLKATA_TRAM': return 'TRAM';
    case 'WB_FERRY': return 'FERRY';
    case 'EASTERN_RAILWAY_SUBURBAN': return 'RAIL';
    case 'KOLKATA_METRO':
    case 'BMRCL': return 'METRO';
    default: return 'BUS';
  }
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length ? value : undefined;
}

function truncate(value: string | undefined, max: number): string | undefined {
  if (value === undefined) return undefined;
  return value.length <= max ? value : value.slice(0, max);
}
