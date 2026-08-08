import { Injectable } from '@nestjs/common';
import { GraphStop, TransitGraphService, haversineMeters } from './transit-graph.service';

/** Average speeds (km/h) used to turn distance into minutes. */
const SPEED = { WALK: 4.5, BUS: 22, METRO: 32 } as const;

/** Minutes added per boarding — waiting for the service, plus finding the stop. */
const BOARDING_PENALTY_MINUTES = 6;

/** How far a rider will walk to reach a stop, or between stops when changing. */
const ACCESS_WALK_METERS = 1500;
const TRANSFER_WALK_METERS = 600;

/** Legs of transit; 3 allows bus → bus → bus, i.e. two transfers. */
const MAX_RIDES = 3;

/**
 * Consecutive stops further apart than this mean a bad geocode, not a long hop
 * — several stops carry coordinates hundreds of km from their real location
 * (Neamatpur sits at 25.93N, ~250km north of where it belongs). Riding through
 * one produces a journey of thousands of kilometres, so the route is abandoned
 * at that point instead.
 */
const MAX_PLAUSIBLE_HOP_KM = 150;

interface Label {
  costMinutes: number;
  round: number;
  prevStopId?: string;
  /** undefined means the rider walked to this stop. */
  viaRouteId?: string;
}

export interface PlannedLeg {
  mode: 'WALK' | 'BUS' | 'METRO';
  fromStop?: GraphStop;
  toStop: GraphStop;
  distanceKm: number;
  durationMinutes: number;
  routeId?: string;
  routeName?: string;
  providerCode?: string;
  /** Whole-route fare, where the operator publishes one. */
  fareINR?: number | null;
  fareSource?: string | null;
}

export interface JourneyEndpoint {
  lat: number;
  lng: number;
  placeId?: string;
  /** Free-text name, used to find stops when the place has no coordinates. */
  name?: string;
}

export interface PlannedJourney {
  legs: PlannedLeg[];
  totalDistanceKm: number;
  totalDurationMinutes: number;
  transfersCount: number;
  providers: string[];
  /** Sum of the ride legs that have a fare. Null when none of them do. */
  totalFareINR: number | null;
  /** True when at least one ride leg has no fare, so the total is a floor. */
  fareIncomplete: boolean;
  fareSources: string[];
}

/**
 * Multi-leg journey search over the route network.
 *
 * Round-based (RAPTOR-style): each round rides every route reachable from the
 * stops found so far, then allows a short walk between nearby stops. Round N
 * therefore yields journeys with N-1 transfers, and the first round to reach the
 * destination gives the fewest-transfers answer.
 *
 * Replaces a single-route lookup that could only ever answer "both stops sit on
 * one bus, in order" — which is why almost every real query came back with
 * "no connecting transport route found".
 */
@Injectable()
export class JourneyPlannerService {
  constructor(private readonly graph: TransitGraphService) {}

  async plan(origin: JourneyEndpoint, destination: JourneyEndpoint): Promise<PlannedJourney | null> {
    await this.graph.ready();

    const originStops = this.accessStops(origin);
    const destStops = new Set(this.accessStops(destination).map(s => s.stopId));

    if (!originStops.length || !destStops.size) return null;

    const labels = new Map<string, Label>();
    let frontier: string[] = [];

    for (const { stopId, walkMinutes } of originStops) {
      const existing = labels.get(stopId);
      if (!existing || walkMinutes < existing.costMinutes) {
        labels.set(stopId, { costMinutes: walkMinutes, round: 0 });
        frontier.push(stopId);
      }
    }

    // Run every round rather than stopping at the first that reaches the
    // destination: the earliest arrival has the fewest transfers, not the
    // shortest time, and one extra change is often far quicker.
    for (let round = 1; round <= MAX_RIDES; round++) {
      const reachedThisRound = new Set<string>();

      // --- ride every route touching the frontier -------------------------
      const candidateRoutes = new Set<string>();
      for (const stopId of frontier) {
        for (const routeId of this.graph.routesServing(stopId)) candidateRoutes.add(routeId);
      }

      for (const routeId of candidateRoutes) {
        const route = this.graph.getRoute(routeId)!;
        let boardIndex = -1;
        let boardCost = Infinity;

        for (let i = 0; i < route.stopIds.length; i++) {
          const label = labels.get(route.stopIds[i]);

          // Board wherever it is cheapest to be so far...
          if (label && label.costMinutes + BOARDING_PENALTY_MINUTES < boardCost) {
            boardIndex = i;
            boardCost = label.costMinutes + BOARDING_PENALTY_MINUTES;
            continue;
          }

          // ...and relax every stop after that boarding point.
          if (boardIndex >= 0 && i > boardIndex) {
            const ride = this.rideMinutes(route.stopIds[i - 1], route.stopIds[i], route.mode);
            // Untrustworthy geometry: stop using this route from here on rather
            // than carrying a broken cost forward to every later stop.
            if (ride === null) break;
            boardCost += ride;

            const current = labels.get(route.stopIds[i]);
            if (!current || boardCost < current.costMinutes) {
              labels.set(route.stopIds[i], {
                costMinutes: boardCost,
                round,
                prevStopId: route.stopIds[boardIndex],
                viaRouteId: routeId,
              });
              reachedThisRound.add(route.stopIds[i]);
            }
          }
        }
      }

      // --- then allow a short walk to a neighbouring stop -----------------
      for (const stopId of [...reachedThisRound]) {
        const from = this.graph.getStop(stopId)!;
        const fromLabel = labels.get(stopId)!;

        for (const nearId of this.graph.stopsNear(from.lat, from.lng, TRANSFER_WALK_METERS)) {
          if (nearId === stopId) continue;

          const near = this.graph.getStop(nearId)!;
          const walk = minutesFor(haversineMeters(from.lat, from.lng, near.lat, near.lng), SPEED.WALK);
          const cost = fromLabel.costMinutes + walk;
          const current = labels.get(nearId);

          if (!current || cost < current.costMinutes) {
            labels.set(nearId, { costMinutes: cost, round, prevStopId: stopId });
            reachedThisRound.add(nearId);
          }
        }
      }

      if (!reachedThisRound.size) break;

      frontier = [...reachedThisRound];
    }

    const best = this.bestOf(destStops, labels);
    return best ? this.buildJourney(best, labels, origin, destination) : null;
  }

  /**
   * Stops a rider can start from, in order of preference:
   *   1. stops tagged with the place
   *   2. stops within walking distance of the place's coordinates
   *   3. stops whose *name* matches the query — the fallback that matters,
   *      because many `places` rows (Kolkata, Bankura) have no coordinates.
   */
  private accessStops(point: JourneyEndpoint) {
    const hasCoords = Number.isFinite(point.lat) && Number.isFinite(point.lng);

    let ids = point.placeId ? this.graph.stopsForPlace(point.placeId) : [];
    if (!ids.length && hasCoords) ids = this.graph.stopsNear(point.lat, point.lng, ACCESS_WALK_METERS);
    if (!ids.length && point.name) ids = this.graph.stopsMatchingName(point.name);

    const candidates = ids
      .map(stopId => {
        const stop = this.graph.getStop(stopId);
        if (!stop) return null;
        // Without a coordinate for the endpoint there is no access walk to cost.
        const meters = hasCoords ? haversineMeters(point.lat, point.lng, stop.lat, stop.lng) : 0;
        return { stopId, meters, walkMinutes: meters ? minutesFor(meters, SPEED.WALK) : 0 };
      })
      .filter((x): x is { stopId: string; meters: number; walkMinutes: number } => x !== null);

    // Some stops are tagged with a place they sit 190km from — bad linkage in
    // the source data. Accepting one produced a "walk" leg of 192.5 km.
    const walkable = candidates.filter(c => c.meters <= ACCESS_WALK_METERS);

    // If every tagged stop is implausibly far, keep only the nearest so the
    // journey is still plannable, rather than inventing a cross-state walk.
    const usable = walkable.length
      ? walkable
      : candidates.sort((a, b) => a.meters - b.meters).slice(0, 1);

    return usable.map(({ stopId, walkMinutes }) => ({ stopId, walkMinutes }));
  }

  /**
   * Share of the route fare matching the distance actually ridden.
   *
   * fareINR prices the whole route, so a short hop on a long-distance service
   * must not be charged the full amount. Consistent with the fares themselves,
   * which providers derive by distance (ESTIMATED_BY_DISTANCE).
   */
  private proratedFare(route: { id: string; fareINR: number | null } | undefined, riddenKm: number) {
    if (!route || route.fareINR === null) return null;

    const total = this.graph.routeLengthKm(route.id);
    if (!total || riddenKm >= total) return route.fareINR;

    // Round up to the rupee: transit fares are not fractional.
    return Math.max(1, Math.ceil(route.fareINR * (riddenKm / total)));
  }

  private bestOf(destStops: Set<string>, labels: Map<string, Label>) {
    let bestId: string | undefined;
    let bestCost = Infinity;

    for (const stopId of destStops) {
      const label = labels.get(stopId);
      if (label && label.costMinutes < bestCost) {
        bestCost = label.costMinutes;
        bestId = stopId;
      }
    }

    return bestId;
  }

  private rideMinutes(fromStopId: string, toStopId: string, mode: 'BUS' | 'METRO') {
    const from = this.graph.getStop(fromStopId);
    const to = this.graph.getStop(toStopId);
    if (!from || !to) return null;

    const meters = haversineMeters(from.lat, from.lng, to.lat, to.lng);
    if (meters > MAX_PLAUSIBLE_HOP_KM * 1000) return null;

    return minutesFor(meters, SPEED[mode]);
  }

  /** Walk the label chain back to the origin, merging consecutive same-route hops. */
  private buildJourney(
    destStopId: string,
    labels: Map<string, Label>,
    origin: JourneyEndpoint,
    destination: JourneyEndpoint,
  ): PlannedJourney {
    const hops: Array<{ from?: string; to: string; viaRouteId?: string }> = [];

    let cursor: string | undefined = destStopId;
    while (cursor) {
      const label: Label | undefined = labels.get(cursor);
      if (!label?.prevStopId) break;
      hops.unshift({ from: label.prevStopId, to: cursor, viaRouteId: label.viaRouteId });
      cursor = label.prevStopId;
    }

    const legs: PlannedLeg[] = [];
    const firstStop = this.graph.getStop(hops[0]?.from ?? destStopId)!;

    // Walk from the requested origin to the first stop.
    const accessMeters = Number.isFinite(origin.lat) && Number.isFinite(origin.lng)
      ? haversineMeters(origin.lat, origin.lng, firstStop.lat, firstStop.lng)
      : 0;
    if (accessMeters > 50) {
      legs.push({
        mode: 'WALK',
        toStop: firstStop,
        distanceKm: accessMeters / 1000,
        durationMinutes: minutesFor(accessMeters, SPEED.WALK),
      });
    }

    for (const hop of hops) {
      const from = this.graph.getStop(hop.from!)!;
      const to = this.graph.getStop(hop.to)!;
      const route = hop.viaRouteId ? this.graph.getRoute(hop.viaRouteId) : undefined;
      const mode = route ? route.mode : 'WALK';
      const km = haversineMeters(from.lat, from.lng, to.lat, to.lng) / 1000;

      const previous = legs[legs.length - 1];

      // Same service continuing — extend rather than emitting a second leg.
      // Compare routeId, not routeName: names repeat across providers and
      // directions, and matching on them merged hops from unrelated routes into
      // one leg, summing their distances into thousands of kilometres.
      if (previous && route && previous.routeId === route.id) {
        previous.toStop = to;
        previous.distanceKm += km;
        previous.durationMinutes += minutesFor(km * 1000, SPEED[mode]);
        continue;
      }

      legs.push({
        mode,
        fromStop: from,
        toStop: to,
        distanceKm: km,
        durationMinutes:
          minutesFor(km * 1000, mode === 'WALK' ? SPEED.WALK : SPEED[mode]) +
          (route ? BOARDING_PENALTY_MINUTES : 0),
        routeId: route?.id,
        routeName: route?.name,
        providerCode: route?.providerCode,
        fareINR: this.proratedFare(route, km),
        fareSource: route?.fareSource ?? null,
      });
    }

    // Walk from the last stop to the requested destination.
    const lastStop = this.graph.getStop(destStopId)!;
    const egressMeters = Number.isFinite(destination.lat) && Number.isFinite(destination.lng)
      ? haversineMeters(lastStop.lat, lastStop.lng, destination.lat, destination.lng)
      : 0;
    if (egressMeters > 50) {
      legs.push({
        mode: 'WALK',
        fromStop: lastStop,
        toStop: lastStop,
        distanceKm: egressMeters / 1000,
        durationMinutes: minutesFor(egressMeters, SPEED.WALK),
      });
    }

    const rides = legs.filter(leg => leg.mode !== 'WALK');
    const priced = rides.filter(leg => typeof leg.fareINR === 'number');

    return {
      legs,
      totalDistanceKm: legs.reduce((sum, leg) => sum + leg.distanceKm, 0),
      totalDurationMinutes: legs.reduce((sum, leg) => sum + leg.durationMinutes, 0),
      transfersCount: Math.max(0, rides.length - 1),
      providers: [...new Set(rides.map(leg => leg.providerCode).filter(Boolean) as string[])],
      // Null rather than 0 when nothing is priced — 0 reads as "free".
      totalFareINR: priced.length ? priced.reduce((sum, leg) => sum + (leg.fareINR ?? 0), 0) : null,
      fareIncomplete: priced.length > 0 && priced.length < rides.length,
      fareSources: [...new Set(priced.map(leg => leg.fareSource).filter(Boolean) as string[])],
    };
  }
}

function minutesFor(meters: number, speedKmh: number) {
  return Math.max(1, Math.round((meters / 1000 / speedKmh) * 60));
}
