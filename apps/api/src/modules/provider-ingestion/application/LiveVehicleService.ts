import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { BusRouteModel, BusRouteStopModel, BusStopModel } from '../infrastructure/sequelize/models';
import { BmtcClient } from '../providers/bmtc/bmtc-official.client';
import { resolveBmtcCacheDir } from '../providers/bmtc/bmtc-official.provider';
import { BmtcRouteDetailsResponse } from '../providers/bmtc/bmtc-official.types';

/**
 * Where BMTC's buses are right now.
 *
 * The same `SearchByRouteDetails_v4` call the harvest uses also carries a
 * `vehicleDetails` block per stop: registration, service type, position,
 * heading and the moment the operator last heard from the vehicle. The harvest
 * reads it for scheduled times; this reads it for the map.
 *
 * Three things this deliberately does not do:
 *
 *  - It does not read the harvest's disk cache. A cached response would report
 *    where a bus stood the first time that route was ever fetched, forever.
 *  - It does not invent a position for a vehicle the operator has not reported
 *    recently. A stale pin on a map is worse than an empty map, because a rider
 *    waits for it.
 *  - It does not fan out across the whole network. Only routes serving stops
 *    near the rider are asked about, capped, because each route is an upstream
 *    request against an operator with no published rate limit.
 */

/** Older than this and we say nothing rather than draw a bus that has moved. */
const MAX_FIX_AGE_SECONDS = Number(process.env.LIVE_VEHICLE_MAX_AGE_S ?? 180);

/** Upstream is shared and unpaid; one answer serves every rider for this long. */
const CACHE_TTL_MS = Number(process.env.LIVE_VEHICLE_TTL_MS ?? 20_000);

/** How many routes near a rider to ask about in one request. */
const MAX_ROUTES = Number(process.env.LIVE_VEHICLE_MAX_ROUTES ?? 6);

export interface LiveVehicle {
  vehicleNumber: string | null;
  serviceType: string | null;
  routeName: string | null;
  latitude: number;
  longitude: number;
  /** Compass degrees, for pointing the icon the way it is travelling. */
  heading: number | null;
  /** Seconds since the operator last heard from this vehicle. */
  fixAgeSeconds: number | null;
}

export interface LiveVehicleResult {
  vehicles: LiveVehicle[];
  routesQueried: number;
  /** True when the answer came from the short shared cache, not upstream. */
  cached: boolean;
  /** Null when nothing is running, so the client can say so rather than guess. */
  observedAt: string | null;
}

interface CacheEntry { at: number; result: LiveVehicleResult }

@Injectable()
export class LiveVehicleService {
  private readonly logger = new Logger(LiveVehicleService.name);
  private readonly client = new BmtcClient({
    cacheDir: resolveBmtcCacheDir(process.env, process.cwd()),
    // Live reads are a handful of calls, not a crawl, but the operator is still
    // unpaid and unmetered.
    minIntervalMs: Number(process.env.LIVE_VEHICLE_INTERVAL_MS ?? 250),
    retries: 1,
    // A live position has a freshness budget, not just a correctness one. The
    // client's 30-second default is right for a harvest that can wait; here it
    // means the rider waits half a minute for a bus that has since moved, and
    // the web proxy has given up long before. Overnight, when BMTC stops
    // answering promptly, this is the difference between an empty map and a
    // hung page.
    requestTimeoutMs: Number(process.env.LIVE_VEHICLE_TIMEOUT_MS ?? 4000),
  });
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    @InjectModel(BusStopModel) private readonly busStops: typeof BusStopModel,
    @InjectModel(BusRouteStopModel) private readonly busRouteStops: typeof BusRouteStopModel,
    @InjectModel(BusRouteModel) private readonly busRoutes: typeof BusRouteModel,
  ) {}

  async near(latitude: number, longitude: number, radiusMetres = 2000): Promise<LiveVehicleResult> {
    // Rounded so riders standing near each other share one upstream answer
    // instead of each triggering their own fan-out. ~100 m of precision.
    const key = `${latitude.toFixed(3)},${longitude.toFixed(3)},${radiusMetres}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return { ...hit.result, cached: true };
    }

    const routes = await this.routesNear(latitude, longitude, radiusMetres);

    // Issued together rather than one after another. Six sequential calls took
    // 13 seconds, past the web proxy's timeout, so the map received nothing
    // even when buses were running. The client's own minimum interval still
    // paces them, so this stays gentle on an operator with no published rate
    // limit — it just stops the rider waiting for each in turn.
    const responses = await Promise.all(
      routes.map(async route => {
        const externalId = Number(route.externalId);
        if (!Number.isFinite(externalId)) return [];
        try {
          const response = await this.client.post<BmtcRouteDetailsResponse>(
            'SearchByRouteDetails_v4',
            { routeid: externalId, servicetypeid: 0 },
            { live: true },
          );
          return this.readVehicles(response.body, route.longName);
        } catch (error) {
          // One unreachable route must not empty the map.
          this.logger.warn(`Live lookup failed for route ${route.externalId}: ${String(error).slice(0, 120)}`);
          return [];
        }
      }),
    );

    // One bus calls at many stops on its route and is reported at each, so it
    // arrives many times over. Keyed by registration to draw once.
    const seen = new Map<string, LiveVehicle>();
    for (const vehicle of responses.flat()) {
      const id = vehicle.vehicleNumber ?? `${vehicle.latitude},${vehicle.longitude}`;
      if (!seen.has(id)) seen.set(id, vehicle);
    }

    const vehicles = [...seen.values()];
    const result: LiveVehicleResult = {
      vehicles,
      routesQueried: routes.length,
      cached: false,
      observedAt: vehicles.length ? new Date().toISOString() : null,
    };
    this.cache.set(key, { at: Date.now(), result });
    return result;
  }

  /**
   * Stop positions, held in memory and rebuilt occasionally.
   *
   * Reading 22k stops from Postgres on every request cost ~28 seconds and blew
   * through the web proxy's timeout, so the map never received a bus. The set
   * changes when an import promotes, which is at most nightly; a request must
   * not pay for that.
   */
  private stopIndex: { at: number; stops: Array<{ id: string; lat: number; lng: number }> } | null = null;

  private async nearbyStopIds(latitude: number, longitude: number, radiusMetres: number) {
    const TTL_MS = Number(process.env.LIVE_VEHICLE_STOP_INDEX_TTL_MS ?? 10 * 60_000);
    if (!this.stopIndex || Date.now() - this.stopIndex.at > TTL_MS) {
      const rows = await this.busStops.findAll({ attributes: ['id', 'metadata'] });
      const stops: Array<{ id: string; lat: number; lng: number }> = [];
      for (const row of rows) {
        const lat = Number(row.metadata?.latitude);
        const lng = Number(row.metadata?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        if (lat === 0 && lng === 0) continue;
        stops.push({ id: row.id, lat, lng });
      }
      this.stopIndex = { at: Date.now(), stops };
      this.logger.log(`Live vehicle stop index rebuilt: ${stops.length} located stops.`);
    }

    // A degree of latitude is ~111 km everywhere; longitude shrinks with the
    // cosine of latitude. A box is enough to shortlist before the fan-out.
    const latSpan = radiusMetres / 111_000;
    const lngSpan = latSpan / Math.max(0.2, Math.cos((latitude * Math.PI) / 180));

    return this.stopIndex.stops
      .filter(stop =>
        Math.abs(stop.lat - latitude) <= latSpan && Math.abs(stop.lng - longitude) <= lngSpan)
      .map(stop => stop.id);
  }

  /** Routes calling at stops near the rider, busiest first. */
  private async routesNear(latitude: number, longitude: number, radiusMetres: number) {
    const nearbyStopIds = await this.nearbyStopIds(latitude, longitude, radiusMetres);
    if (!nearbyStopIds.length) return [];

    const memberships = await this.busRouteStops.findAll({
      where: { stopId: { [Op.in]: nearbyStopIds } },
      attributes: ['routeId'],
    });

    // Most-served routes first: with a cap on the fan-out, the ones a rider is
    // most likely to want are the ones with the most stops nearby.
    const weight = new Map<string, number>();
    for (const row of memberships) weight.set(row.routeId, (weight.get(row.routeId) ?? 0) + 1);
    const routeIds = [...weight.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_ROUTES)
      .map(([routeId]) => routeId);

    return this.busRoutes.findAll({
      where: { id: { [Op.in]: routeIds }, providerCode: 'BMTC_OFFICIAL' },
      attributes: ['id', 'externalId', 'longName'],
    });
  }

  /** Vehicles from one route-details response, freshest reading per bus. */
  private readVehicles(body: BmtcRouteDetailsResponse, routeName: string | null): LiveVehicle[] {
    const stops = [
      ...(body.data ?? body.routedetails ?? []),
      ...(body.up?.data ?? []),
      ...(body.down?.data ?? []),
    ];

    const out: LiveVehicle[] = [];
    for (const stop of stops) {
      for (const vehicle of stop.vehicleDetails ?? []) {
        const latitude = Number(vehicle.centerlat);
        const longitude = Number(vehicle.centerlong);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
        // 0,0 is a real place in the Gulf of Guinea, and a bus is not in it.
        if (latitude === 0 && longitude === 0) continue;

        const fixAgeSeconds = ageInSeconds(vehicle.lastrefreshon);
        // An old fix is not a location, it is a memory. Drawn on a map a rider
        // reads it as "the bus is here", and waits.
        if (fixAgeSeconds !== null && fixAgeSeconds > MAX_FIX_AGE_SECONDS) continue;

        out.push({
          vehicleNumber: vehicle.vehiclenumber?.trim() || null,
          serviceType: vehicle.servicetype?.trim() || null,
          routeName,
          latitude,
          longitude,
          heading: Number.isFinite(Number(vehicle.heading)) ? Number(vehicle.heading) : null,
          fixAgeSeconds,
        });
      }
    }
    return out;
  }
}

/**
 * Seconds since a BMTC timestamp, which arrives as "16-08-2026 17:55:55".
 *
 * Parsed explicitly rather than handed to `new Date()`: that reads the same
 * string as a US month-first date, so 16-08 is invalid and 08-06 silently means
 * June, making a fix look hours fresher or staler than it is.
 */
export function ageInSeconds(stamp: string | undefined, now = Date.now()): number | null {
  if (!stamp?.trim()) return null;
  const match = stamp.trim().match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, day, month, year, hour, minute, second] = match.map(Number) as unknown as number[];
  // BMTC reports in India Standard Time, UTC+5:30.
  const utc = Date.UTC(year, month - 1, day, hour, minute, second) - 5.5 * 3600 * 1000;
  if (!Number.isFinite(utc)) return null;
  return Math.round((now - utc) / 1000);
}
