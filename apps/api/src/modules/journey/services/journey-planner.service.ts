import { Injectable } from '@nestjs/common';
import { GraphRoute, GraphStop, TransitGraphService, clockTime, haversineMeters } from './transit-graph.service';

/**
 * Average speeds (km/h) used to turn distance into minutes.
 *
 * AUTO covers the hailed first/last mile — auto-rickshaw, bike taxi, cab. It
 * is deliberately below the bus figure: those vehicles are quicker door to
 * door but share the same congestion, and a rider stranded by an optimistic
 * estimate is worse off than one who arrives early.
 */
const SPEED = {
  WALK: 4.5,
  AUTO: 18,
  SHARED_AUTO: 18,
  BUS: 22,
  METRO: 32,
  FERRY: 18,
  TRAM: 16,
  RAIL: 35,
} as const;

/**
 * Past this, walking stops being an answer and becomes a warning.
 *
 * The access radius is up to 5 km, and 5 km at 4.5 km/h is 67 minutes. Offering
 * that as the only way to reach the first stop is not a plan a rider can use,
 * so beyond this distance the hailed ride is recommended and the walk is kept
 * as an option rather than the headline.
 */
const COMFORTABLE_WALK_METERS = Math.max(
  300,
  Number(process.env.JOURNEY_COMFORTABLE_WALK_METERS || 1200),
);

/** Minutes added per boarding — waiting for the service, plus finding the stop. */
const BOARDING_PENALTY_MINUTES = 6;

/**
 * How far a rider will walk to reach a service.
 * Community buses and auto stands may be sparse outside the city core, so the
 * default is 3 km and deployments may raise it to at most 5 km. The result is
 * still costed as an explicit WALK leg; it is never presented as door-to-door.
 */
const ACCESS_WALK_METERS = Math.min(
  5000,
  Math.max(500, Number(process.env.JOURNEY_ACCESS_WALK_METERS || 3000)),
);
const TRANSFER_WALK_METERS = 600;

/** Legs of transit; 3 allows bus → bus → bus, i.e. two transfers. */
const MAX_RIDES = 3;

/** How many alternative journeys to offer before stopping. */
const MAX_OPTIONS = 4;

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

/**
 * One way to cover a first or last mile.
 *
 * Both ends of a journey are offered, so the rider chooses rather than being
 * told. No fare is quoted for a hailed ride: Ratroo has no fare feed for
 * Rapido, Ola, Uber or a metered auto, and a made-up number is worse than
 * none. `durationMinutes` is a distance-over-speed estimate, which is why
 * `isEstimate` is true on every option here.
 */
export interface FirstMileOption {
  mode: 'WALK' | 'AUTO';
  durationMinutes: number;
  /** The one the leg itself reports. Exactly one option carries this. */
  recommended: boolean;
  /** Rider-facing wording, e.g. "Auto, bike taxi or cab (Rapido, Ola, Uber)". */
  label: string;
  isEstimate: true;
}

export interface PlannedLeg {
  mode: 'WALK' | 'AUTO' | 'SHARED_AUTO' | 'BUS' | 'METRO' | 'FERRY' | 'TRAM' | 'RAIL';
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
  /**
   * Scheduled "HH:MM" at the boarding and alighting stops, from the operator's
   * timetable. Both null on walking legs and on services with no published
   * times — the client says "time not published" rather than inventing one.
   */
  departureTime?: string | null;
  arrivalTime?: string | null;
  /**
   * Set only on the first and last legs — how to reach the first stop, and how
   * to leave the last one. Present even when walking is the recommendation, so
   * a rider carrying shopping can still see the ride.
   */
  options?: FirstMileOption[];
}

export interface JourneyEndpoint {
  lat: number;
  lng: number;
  placeId?: string;
  /** Free-text name, used to find stops when the place has no coordinates. */
  name?: string;
  /**
   * Other names for the same place. A canonical place is titled after one
   * operator's wording — "Asansol Bus Terminus" — while other operators call
   * the same stand "Asansol", and only some of their stops are linked to it.
   */
  altNames?: string[];
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

  /** The single best journey, kept for callers that want one answer. */
  async plan(origin: JourneyEndpoint, destination: JourneyEndpoint): Promise<PlannedJourney | null> {
    return (await this.planAll(origin, destination))[0] ?? null;
  }

  /**
   * Several genuinely different ways to make the trip, fastest first.
   *
   * A round-based search answers "the best journey", and its later rounds only
   * beat round one by being faster — so it returns a single option however many
   * services run the corridor. WBBus.in lists five buses for Kolkata to
   * Arambagh; a rider wants to see them.
   *
   * So the search is run repeatedly, each pass banning the services the
   * previous answers boarded. That forces a different first bus each time, and
   * naturally surfaces both "direct but slower" and "one change, quicker".
   *
   * ponytail: re-running the whole search per option is O(k · search). k is 4
   * and a warm search is ~350ms, so this is cheap enough; if the corridor
   * count ever grows, cache the round labels between passes instead.
   */
  async planAll(
    origin: JourneyEndpoint,
    destination: JourneyEndpoint,
    limit = MAX_OPTIONS,
  ): Promise<PlannedJourney[]> {
    await this.graph.ready();

    const journeys: PlannedJourney[] = [];
    const banned = new Set<string>();
    const seen = new Set<string>();

    for (let attempt = 0; attempt < limit; attempt++) {
      const journey = this.search(origin, destination, banned);
      if (!journey) break;

      // Identity is the services ridden, in order.
      const signature = journey.legs.map(leg => leg.routeId ?? 'walk').join('>');
      if (seen.has(signature)) break;
      seen.add(signature);
      journeys.push(journey);

      // Ban the first service this journey boards, so the next pass has to
      // find another one. Banning every leg would rule out corridors that
      // legitimately share a connecting bus.
      const firstRide = journey.legs.find(leg => leg.routeId);
      if (!firstRide?.routeId) break;
      banned.add(firstRide.routeId);
    }

    // Fastest first, then earliest departure. Without the tie-break, four
    // services of equal length came back in search order and the list opened
    // with the 17:30 — a rider reads a timetable in clock order.
    return journeys.sort((a, b) => {
      const byDuration = a.totalDurationMinutes - b.totalDurationMinutes;
      if (byDuration !== 0) return byDuration;
      return (departsAt(a) ?? Infinity) - (departsAt(b) ?? Infinity);
    });
  }

  /** One round-based search, optionally forbidden from boarding some routes. */
  private search(
    origin: JourneyEndpoint,
    destination: JourneyEndpoint,
    banned: Set<string>,
  ): PlannedJourney | null {

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
        // Already offered as an earlier option; find the rider a different bus.
        if (banned.has(routeId)) continue;

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
            const ride = this.rideMinutes(route.stopIds[i - 1], route.stopIds[i], route);
            // Untrustworthy geometry: stop using this route from here on rather
            // than carrying a broken cost forward to every later stop.
            if (ride === null) break;
            boardCost += ride;

            const current = labels.get(route.stopIds[i]);
            if (!current || boardCost < current.costMinutes) {
              const label: Label = {
                costMinutes: boardCost,
                round,
                prevStopId: route.stopIds[boardIndex],
                viaRouteId: routeId,
              };
              labels.set(route.stopIds[i], label);
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
   * Stops a rider can start from: everything tagged with the place, everything
   * within walking distance of it, and everything sharing one of its names.
   *
   * All three, unioned — not the first that returns anything. The linkage
   * between provider stops and canonical places is incomplete, so a place that
   * has *some* tagged stops can still be missing the ones that carry the
   * services. Asansol was exactly that: the canonical place held two
   * operators' stops, the route from Telipukur called at a third operator's
   * stop of the same stand, and the planner reported no route between two
   * places six routes connect.
   *
   * Unioning is safe because the distance filter below still applies: a stop
   * named "Asansol" elsewhere in the state is dropped for being unwalkable,
   * not accepted for having the right name.
   */
  private accessStops(point: JourneyEndpoint) {
    const hasCoords = Number.isFinite(point.lat) && Number.isFinite(point.lng);

    const ids = new Set<string>();
    if (point.placeId) {
      for (const id of this.graph.stopsForPlace(point.placeId)) ids.add(id);
    }
    if (hasCoords) {
      for (const id of this.graph.stopsNear(point.lat, point.lng, ACCESS_WALK_METERS)) {
        ids.add(id);
      }
    }
    for (const name of [point.name, ...(point.altNames ?? [])]) {
      if (!name?.trim()) continue;
      for (const id of this.graph.stopsMatchingName(name)) ids.add(id);
    }

    const candidates = [...ids]
      .map(stopId => {
        const stop = this.graph.getStop(stopId);
        if (!stop) return null;

        // Without a coordinate at either end there is no access walk to cost.
        //
        // The stop's own coordinates were not checked before, so a stop with
        // none produced NaN metres, failed the walkable test below, and was
        // dropped — but only when some *other* match had coordinates, which
        // made it look like a distance decision rather than missing data.
        // Asansol's busiest record is exactly that: no coordinates, 144
        // scheduled calls, and invisible to every journey that named it.
        //
        // Unknown distance is treated as no distance rather than infinite
        // distance. We cannot measure the walk, and refusing to plan is worse
        // than not costing a walk we have no way to cost.
        const stopHasCoords = Number.isFinite(stop.lat) && Number.isFinite(stop.lng);
        const meters =
          hasCoords && stopHasCoords
            ? haversineMeters(point.lat, point.lng, stop.lat, stop.lng)
            : 0;
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

  /**
   * How long one hop takes, from the operator's timetable where it exists and
   * from geometry where it does not.
   *
   * The timetable comes first because it is the operator's own answer, and
   * because geometry has nothing to say about a stop with no coordinates.
   * That case is not rare: Asansol's busiest record has none, and a purely
   * geometric cost returned NaN there — which is never less than an existing
   * label, so the route died at that stop and the journey was reported as
   * impossible while a bus ran it twice a day.
   */
  private rideMinutes(fromStopId: string, toStopId: string, route: GraphRoute) {
    const from = this.graph.getStop(fromStopId);
    const to = this.graph.getStop(toStopId);
    if (!from || !to) return null;

    const departs = route.times.get(fromStopId);
    const arrives = route.times.get(toStopId);
    if (departs !== undefined && arrives !== undefined) {
      const scheduled = arrives - departs;
      // Only forward hops within a day. A negative or absurd gap means the two
      // times came from opposite directions of the route, not from one run.
      if (scheduled > 0 && scheduled <= 24 * 60) return scheduled;
    }

    const meters = haversineMeters(from.lat, from.lng, to.lat, to.lng);
    // NaN fails this test, so an unlocated stop must be caught explicitly
    // rather than falling through to a NaN cost.
    if (!Number.isFinite(meters)) return null;
    if (meters > MAX_PLAUSIBLE_HOP_KM * 1000) return null;

    return minutesFor(meters, SPEED[route.mode]);
  }

  /** Walk the label chain back to the origin, merging consecutive same-route hops. */
  /**
   * The operator's scheduled time at a stop, or null when it publishes none.
   *
   * Never derived from the journey's own duration estimate: a computed "board
   * at 06:47" would look exactly like a real timetable while being a guess.
   */
  private timeAt(route: { times: Map<string, number> } | undefined, stopId: string): string | null {
    const minutes = route?.times.get(stopId);
    return minutes === undefined ? null : clockTime(minutes);
  }

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
      legs.push(firstMileLeg(accessMeters, { toStop: firstStop }));
    }

    for (const hop of hops) {
      const from = this.graph.getStop(hop.from!)!;
      const to = this.graph.getStop(hop.to)!;
      const route = hop.viaRouteId ? this.graph.getRoute(hop.viaRouteId) : undefined;
      const mode = route ? route.mode : 'WALK';
      // Unknown where one end is, so the leg reports no distance rather than
      // NaN. The times still come from the timetable.
      const metres = haversineMeters(from.lat, from.lng, to.lat, to.lng);
      const km = Number.isFinite(metres) ? metres / 1000 : 0;

      const previous = legs[legs.length - 1];

      // Same service continuing — extend rather than emitting a second leg.
      // Compare routeId, not routeName: names repeat across providers and
      // directions, and matching on them merged hops from unrelated routes into
      // one leg, summing their distances into thousands of kilometres.
      if (previous && route && previous.routeId === route.id) {
        previous.toStop = to;
        previous.distanceKm += km;
        previous.durationMinutes += minutesFor(km * 1000, SPEED[mode]);
        // Riding further means alighting later; the boarding time is unchanged.
        previous.arrivalTime = this.timeAt(route, to.id) ?? previous.arrivalTime;
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
        departureTime: route ? this.timeAt(route, from.id) : null,
        arrivalTime: route ? this.timeAt(route, to.id) : null,
      });
    }

    // Walk from the last stop to the requested destination.
    const lastStop = this.graph.getStop(destStopId)!;
    const egressMeters = Number.isFinite(destination.lat) && Number.isFinite(destination.lng)
      ? haversineMeters(lastStop.lat, lastStop.lng, destination.lat, destination.lng)
      : 0;
    if (egressMeters > 50) {
      legs.push(firstMileLeg(egressMeters, { fromStop: lastStop, toStop: lastStop }));
    }

    // Transit legs only. A first/last mile — walked or hailed — is neither a
    // transfer nor an operator, and counting one would tell a rider they change
    // services when they do not, and would make `fareIncomplete` true on every
    // journey that starts more than 50 m from a stop.
    // A fixed-route AUTO has a routeId; a hailed first/last-mile AUTO does not.
    // Counting by mode erased registered auto routes from transfers, providers
    // and fares even though the rider actually boarded that service.
    const rides = legs.filter(leg => Boolean(leg.routeId));
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

/**
 * The leg that gets a rider between their own location and a stop.
 *
 * Shared by both ends rather than written twice: they had drifted already —
 * the access leg set no `fromStop` and the egress leg set `fromStop` and
 * `toStop` to the same stop — and any change to first-mile behaviour had to be
 * made in two places to take effect.
 *
 * Walking is recommended while it is reasonable and the ride is recommended
 * once it is not, but both are always returned. The rider decides; the planner
 * only says which it would pick.
 */
export function firstMileLeg(
  meters: number,
  ends: { fromStop?: GraphStop; toStop: GraphStop },
): PlannedLeg {
  const walkMinutes = minutesFor(meters, SPEED.WALK);
  const autoMinutes = minutesFor(meters, SPEED.AUTO);
  const walkable = meters <= COMFORTABLE_WALK_METERS;

  const options: FirstMileOption[] = [
    {
      mode: 'WALK',
      durationMinutes: walkMinutes,
      recommended: walkable,
      label: meters < 1000
        ? `Walk ${Math.round(meters)} m`
        : `Walk ${(meters / 1000).toFixed(1)} km`,
      isEstimate: true,
    },
    {
      mode: 'AUTO',
      durationMinutes: autoMinutes,
      recommended: !walkable,
      // Named operators, because "take a ride" is not actionable in Bengaluru
      // and these are the apps a rider already has. No fare: Ratroo has no
      // fare feed for any of them.
      label: `Auto, bike taxi or cab (Rapido, Ola, Uber) · ${(meters / 1000).toFixed(1)} km`,
      isEstimate: true,
    },
  ];

  const recommended = options.find(option => option.recommended)!;

  return {
    ...ends,
    mode: recommended.mode,
    distanceKm: meters / 1000,
    durationMinutes: recommended.durationMinutes,
    options,
  };
}

/** Minutes past midnight of a journey's first timed boarding, or null. */
function departsAt(journey: PlannedJourney): number | null {
  for (const leg of journey.legs) {
    const time = leg.departureTime;
    if (!time) continue;
    const [hours, minutes] = time.split(':').map(Number);
    if (Number.isFinite(hours) && Number.isFinite(minutes)) return hours * 60 + minutes;
  }
  return null;
}
