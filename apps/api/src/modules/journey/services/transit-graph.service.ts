import { Injectable, Logger } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';

export interface GraphStop {
  id: string;
  placeId: string | null;
  name: string;
  lat: number;
  lng: number;
}

export interface GraphRoute {
  id: string;
  name: string;
  providerCode: string;
  mode: 'BUS' | 'METRO';
  /** Stop ids in travel order. */
  stopIds: string[];
  /** Operator fare for the whole route, where the provider publishes one. */
  fareINR: number | null;
  /** e.g. ESTIMATED_BY_DISTANCE — most WBBus fares are derived, not official. */
  fareSource: string | null;
}

/**
 * The route network held in memory for path-finding.
 *
 * ~12k stops and ~15k route-stop rows: small enough that loading it once beats
 * asking Postgres for neighbours on every expansion of every search.
 *
 * Rebuilt on demand (see invalidate) — the nightly sync changes the network at
 * most once a day.
 */
@Injectable()
export class TransitGraphService {
  private readonly logger = new Logger(TransitGraphService.name);

  private stops = new Map<string, GraphStop>();
  private routes = new Map<string, GraphRoute>();
  private routesByStop = new Map<string, string[]>();
  private stopsByPlace = new Map<string, string[]>();
  /** Spatial buckets keyed by rounded lat/lng, for walking-transfer lookups. */
  private grid = new Map<string, string[]>();
  private routeLengths = new Map<string, number>();
  private loaded?: Promise<void>;

  constructor(private readonly sequelize: Sequelize) {}

  invalidate() {
    this.loaded = undefined;
    this.routeLengths.clear();
  }

  async ready() {
    this.loaded ??= this.load();
    await this.loaded;
  }

  getStop(id: string) {
    return this.stops.get(id);
  }

  getRoute(id: string) {
    return this.routes.get(id);
  }

  /**
   * End-to-end length of a route, cached. Needed to prorate fares: fareINR is
   * the whole-route price, so charging it for a two-stop hop overstated a
   * Sealdah-Barasat ride at the full Digha-Baharampur fare of Rs 1385.
   */
  routeLengthKm(id: string): number {
    const cached = this.routeLengths.get(id);
    if (cached !== undefined) return cached;

    const route = this.routes.get(id);
    let km = 0;

    if (route) {
      for (let i = 1; i < route.stopIds.length; i++) {
        const a = this.stops.get(route.stopIds[i - 1]);
        const b = this.stops.get(route.stopIds[i]);
        if (a && b) km += haversineMeters(a.lat, a.lng, b.lat, b.lng) / 1000;
      }
    }

    this.routeLengths.set(id, km);
    return km;
  }

  routesServing(stopId: string) {
    return this.routesByStop.get(stopId) ?? [];
  }

  stopsForPlace(placeId: string) {
    return this.stopsByPlace.get(placeId) ?? [];
  }

  /**
   * Stops whose name matches a free-text query. Many `places` rows carry no
   * coordinates, so the stop name is often the only usable anchor for a
   * journey endpoint.
   */
  stopsMatchingName(query: string, limit = 12): string[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];

    const exact: string[] = [];
    const partial: string[] = [];

    for (const stop of this.stops.values()) {
      const name = stop.name.toLowerCase();
      if (name === needle) exact.push(stop.id);
      else if (name.includes(needle)) partial.push(stop.id);

      if (exact.length >= limit) break;
    }

    return [...exact, ...partial].slice(0, limit);
  }

  /** Stops within `radiusMeters`, found through the grid rather than scanning all 12k. */
  stopsNear(lat: number, lng: number, radiusMeters: number): string[] {
    const cell = 0.01; // ~1.1 km
    const span = Math.max(1, Math.ceil(radiusMeters / 1000 / 1.1));
    const found: string[] = [];

    for (let dy = -span; dy <= span; dy++) {
      for (let dx = -span; dx <= span; dx++) {
        const key = this.cellKey(lat + dy * cell, lng + dx * cell);
        for (const stopId of this.grid.get(key) ?? []) {
          const stop = this.stops.get(stopId)!;
          if (haversineMeters(lat, lng, stop.lat, stop.lng) <= radiusMeters) {
            found.push(stopId);
          }
        }
      }
    }

    return found;
  }

  private cellKey(lat: number, lng: number) {
    return `${Math.floor(lat / 0.01)}:${Math.floor(lng / 0.01)}`;
  }

  private async load() {
    const startedAt = Date.now();

    // lat/lng live in the metadata JSON; stops without coordinates can't take
    // part in walking transfers, so they are dropped from the graph entirely.
    const stopRows = await this.sequelize.query<{
      id: string; placeId: string | null; name: string; lat: string | null; lng: string | null;
    }>(
      `SELECT id, "placeId", name,
              metadata->>'latitude'  AS lat,
              metadata->>'longitude' AS lng
       FROM bus_stops
       UNION ALL
       SELECT id, NULL AS "placeId", name,
              metadata->>'latitude'  AS lat,
              metadata->>'longitude' AS lng
       FROM metro_stations`,
      { type: QueryTypes.SELECT },
    );

    this.stops.clear();
    this.grid.clear();
    this.stopsByPlace.clear();

    for (const row of stopRows) {
      // Number(null) is 0, not NaN — coercing first put all 524 stops with no
      // coordinates at 0,0 off West Africa, where they became each other's
      // "nearby" stops and polluted every search.
      if (row.lat === null || row.lng === null) continue;

      const lat = Number(row.lat);
      const lng = Number(row.lng);

      // Everything served here is in India; anything else is a broken record.
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (lat < 6 || lat > 38 || lng < 68 || lng > 98) continue;

      this.stops.set(row.id, { id: row.id, placeId: row.placeId, name: row.name, lat, lng });
      pushTo(this.grid, this.cellKey(lat, lng), row.id);
      if (row.placeId) pushTo(this.stopsByPlace, row.placeId, row.id);
    }

    const routeRows = await this.sequelize.query<{
      routeId: string; name: string; providerCode: string; mode: 'BUS' | 'METRO';
      stopId: string; sequence: number; fareINR: string | null; fareSource: string | null;
    }>(
      `SELECT r.id AS "routeId", r."longName" AS name, r."providerCode", 'BUS' AS mode,
              rs."stopId", rs.sequence,
              r.metadata->>'fareINR' AS "fareINR", r.metadata->>'fareSource' AS "fareSource"
       FROM bus_routes r
       JOIN bus_route_stops rs ON rs."routeId" = r.id
       UNION ALL
       SELECT l.id AS "routeId", l.name, l."providerCode", 'METRO' AS mode,
              ls."stationId" AS "stopId", ls.sequence, NULL AS "fareINR", NULL AS "fareSource"
       FROM metro_lines l
       JOIN metro_line_stations ls ON ls."lineId" = l.id
       ORDER BY "routeId", sequence`,
      { type: QueryTypes.SELECT },
    );

    this.routes.clear();
    this.routesByStop.clear();

    for (const row of routeRows) {
      if (!this.stops.has(row.stopId)) continue;

      let route = this.routes.get(row.routeId);
      if (!route) {
        route = {
          id: row.routeId, name: row.name, providerCode: row.providerCode, mode: row.mode,
          stopIds: [],
          fareINR: row.fareINR === null ? null : Number(row.fareINR),
          fareSource: row.fareSource,
        };
        this.routes.set(row.routeId, route);
      }

      route.stopIds.push(row.stopId);
      pushTo(this.routesByStop, row.stopId, row.routeId);
    }

    this.logger.log(
      `Transit graph loaded in ${Date.now() - startedAt}ms: ` +
        `${this.stops.size} stops, ${this.routes.size} routes`,
    );
  }
}

function pushTo(map: Map<string, string[]>, key: string, value: string) {
  const list = map.get(key);
  if (list) {
    list.push(value);
  } else {
    map.set(key, [value]);
  }
}

/** Great-circle distance in metres. */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}
