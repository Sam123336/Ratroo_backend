/**
 * Namma BMTC wire shapes -> canonical mobility objects.
 *
 * Pure: no network, no clock, no database. Everything it needs arrives as an
 * argument, so the whole mapping is exercisable from fixtures — which is how
 * it is tested, since the upstream API cannot be reached from CI.
 */
import {
  CanonicalAgency,
  CanonicalMobilityNode,
  CanonicalRoutePattern,
  CanonicalStopTime,
  CanonicalTrip,
  ServiceClass,
} from '../../domain/canonical-mobility';
import {
  BmtcRoute,
  BmtcRouteStop,
  BmtcServiceType,
  BmtcTrip,
  BmtcVehicleDetail,
} from './bmtc-official.types';

export const BMTC_PROVIDER_CODE = 'BMTC_OFFICIAL';

const GEOGRAPHY = {
  countryCode: 'IN' as const,
  stateCode: 'KA',
  district: 'Bengaluru Urban',
  metropolitanArea: 'Bengaluru',
};

export const BMTC_AGENCY: CanonicalAgency = {
  externalId: 'BMTC',
  providerCode: BMTC_PROVIDER_CODE,
  name: 'Bengaluru Metropolitan Transport Corporation',
  shortName: 'BMTC',
  website: 'https://mybmtc.karnataka.gov.in',
  geography: GEOGRAPHY,
};

/**
 * BMTC's own service names -> our [ServiceClass].
 *
 * Matched on substrings because the API's spelling varies by deployment
 * ("Vayu Vajra", "VAYU VAJRA", "Vayuvajra"). Order matters: "Vayu Vajra" is
 * checked before "Vajra", or every airport service would classify as PREMIUM.
 *
 * An unrecognised name maps to UNKNOWN rather than REGULAR. Guessing REGULAR
 * would quietly file a premium AC service as an ordinary bus, and the fare
 * shown to a rider would be wrong.
 */
const SERVICE_CLASS_RULES: Array<[RegExp, ServiceClass]> = [
  [/vayu\s*vajra|airport/i, 'AIRPORT'],
  [/metro\s*feeder|feeder/i, 'METRO_FEEDER'],
  // Before the PREMIUM rule, whose `ac\b` matches the "AC" inside
  // "Non AC/Ordinary" — the slash is a word boundary. The live deployment
  // returns exactly two names, "AC" and "Non AC/Ordinary", so without this
  // every ordinary bus in Bengaluru classified as PREMIUM and would have been
  // priced at the Vajra fare.
  [/non[-\s]*ac|ordinary/i, 'REGULAR'],
  [/vajra|volvo|ac\b/i, 'PREMIUM'],
  [/night|nithya/i, 'NIGHT'],
  [/big\s*10|chakra|atal|express/i, 'EXPRESS'],
  [/regular|city/i, 'REGULAR'],
];

export function serviceClassFor(serviceType?: string | null): ServiceClass {
  const name = (serviceType ?? '').trim();
  if (!name) return 'UNKNOWN';
  for (const [pattern, cls] of SERVICE_CLASS_RULES) {
    if (pattern.test(name)) return cls;
  }
  return 'UNKNOWN';
}

export function serviceClassLookup(
  types: BmtcServiceType[],
): Map<number, ServiceClass> {
  return new Map(types.map((t) => [t.servicetypeid, serviceClassFor(t.servicetype)]));
}

export function normalizeName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A stop, from the route-details call.
 *
 * Coordinates are dropped when they are absent *or* zero. BMTC returns
 * `0,0` for stops it has not surveyed, and 0,0 is a real place in the Gulf of
 * Guinea — a stop plotted there would be "nearest" to nobody and would drag
 * any bounding-box query with it.
 */
export function toNode(stop: BmtcRouteStop): CanonicalMobilityNode {
  const lat = stop.centerlat;
  const lon = stop.centerlong;
  const located = typeof lat === 'number' && typeof lon === 'number' && (lat !== 0 || lon !== 0);

  return {
    externalId: String(stop.stationid),
    providerCode: BMTC_PROVIDER_CODE,
    nodeType: 'BUS_STOP',
    name: stop.stationname.trim(),
    normalizedName: normalizeName(stop.stationname),
    aliases: [],
    ...(located ? { latitude: lat, longitude: lon } : {}),
    geography: GEOGRAPHY,
    // Located stops come straight from the operator; unlocated ones are still
    // real stops, just unplottable, so they keep a lower score rather than
    // being discarded.
    confidence: located ? 0.9 : 0.6,
  };
}

/** BMTC route ids are directional; `routeparentid` is the pair they belong to. */
export function toRoutePattern(
  route: BmtcRoute,
  stops: BmtcRouteStop[],
  serviceClass: ServiceClass = 'UNKNOWN',
): CanonicalRoutePattern {
  const ordered = [...stops].sort(
    (a, b) => (a.routeorder ?? 0) - (b.routeorder ?? 0),
  );

  return {
    externalId: String(route.routeid),
    providerCode: BMTC_PROVIDER_CODE,
    agencyExternalId: 'BMTC',
    mode: 'BUS',
    shortName: route.routeno?.trim(),
    longName: route.routename?.trim() || `${route.fromstation ?? ''} to ${route.tostation ?? ''}`.trim(),
    directionId: route.routeparentid ? String(route.routeparentid) : undefined,
    operationalStatus: 'ACTIVE',
    serviceClass,
    stops: ordered.map((s, i) => ({
      nodeExternalId: String(s.stationid),
      name: s.stationname.trim(),
      // The API's routeorder is not always 1-based or gap-free, so sequence is
      // re-derived from sort position. A gap would make a downstream "next
      // stop" lookup skip a stop.
      sequence: i + 1,
      pickupAllowed: true,
      dropoffAllowed: true,
    })),
  };
}

/**
 * Trips reassembled from the per-stop `vehicleDetails` blocks.
 *
 * `/SearchByRouteDetails_v4` answers per *stop*: each stop lists the vehicles
 * calling there with that vehicle's scheduled time at that stop. A trip is the
 * transpose — one vehicle's calls read across the route in stop order — so
 * this collects them into [CanonicalTrip]s with a time at *every* stop, which
 * is the timing `/GetTimetableByRouteid_v3` does not give at any intermediate
 * stop and does not give at all for 83% of routes.
 *
 * Keyed on vehicle *and* `sch_tripstarttime`, not vehicle alone: a bus that
 * runs the route twice in one snapshot appears twice at every stop, and keying
 * on the vehicle would interleave both runs into one trip whose times zig-zag.
 *
 * Times are BMTC's `sch_*`, so `timeIsEstimated` is false — nothing here is
 * interpolated. Stops the snapshot left blank are dropped rather than filled;
 * a trip caught mid-route reports only the calls BMTC actually sent.
 */
export function tripsFromVehicleDetails(
  route: BmtcRoute,
  stops: BmtcRouteStop[],
): CanonicalTrip[] {
  const ordered = [...stops].sort(
    (a, b) => (a.routeorder ?? 0) - (b.routeorder ?? 0),
  );

  const runs = new Map<
    string,
    { vehicle: BmtcVehicleDetail; calls: CanonicalStopTime[] }
  >();

  ordered.forEach((stop, index) => {
    for (const vehicle of stop.vehicleDetails ?? []) {
      const arrival = normalizeTime(vehicle.sch_arrivaltime);
      const departure = normalizeTime(vehicle.sch_departuretime) ?? arrival;
      if (!arrival && !departure) continue;

      const key = `${vehicle.vehicleid ?? vehicle.vehiclenumber ?? '?'}|${vehicle.sch_tripstarttime ?? ''}`;
      const run = runs.get(key) ?? { vehicle, calls: [] };
      run.calls.push({
        stopExternalId: String(stop.stationid),
        stopName: stop.stationname.trim(),
        // Sequence is the stop's position on the route, matching
        // [toRoutePattern]. The up/down payload carries no `routeorder`, so
        // both functions fall back to array order — they must stay in step or
        // a stop time would attach to the wrong stop.
        sequence: index + 1,
        ...(arrival ? { arrivalTime: arrival } : {}),
        ...(departure ? { departureTime: departure } : {}),
        timeIsEstimated: false,
      });
      runs.set(key, run);
    }
  });

  const trips: CanonicalTrip[] = [];
  for (const [key, run] of runs) {
    const calls = [...run.calls].sort((a, b) => a.sequence - b.sequence);

    // Drop a call that goes backwards in time rather than the whole trip: in
    // the 2,703 runs harvested, 23 carried exactly one such stop against
    // dozens of sound ones. Keeping it would show a rider a bus arriving
    // before it left the previous stop.
    //
    // ponytail: a plain backwards test also drops a legitimate past-midnight
    // call ("23:50" then "00:20"). No harvest has covered midnight yet, so
    // there is nothing to test a rollover branch against; add one — shifting
    // to 24h+ times, which [normalizeTime] already admits up to 27 — when a
    // night-service harvest first produces one.
    const clean: CanonicalStopTime[] = [];
    for (const call of calls) {
      const previous = clean[clean.length - 1];
      const at = call.arrivalTime ?? call.departureTime!;
      const last = previous?.departureTime ?? previous?.arrivalTime;
      if (last && at < last) continue;
      clean.push(call);
    }

    // One call is a snapshot fragment, not a trip — a lone stop time carries
    // no direction and cannot be told from a stray reading.
    if (clean.length < 2) continue;

    trips.push({
      externalId: `${route.routeid}-v${key.replace('|', '-')}`,
      providerCode: BMTC_PROVIDER_CODE,
      routeExternalId: String(route.routeid),
      serviceName: route.routeno?.trim(),
      vehicleRegistration: run.vehicle.vehiclenumber?.trim() || undefined,
      operationalStatus: 'ACTIVE',
      serviceClass: serviceClassFor(run.vehicle.servicetype),
      stopTimes: clean.map((call, i) => ({ ...call, sequence: i + 1 })),
    });
  }

  return trips;
}

/**
 * Drop everything promotion would refuse, before it is ever staged.
 *
 * `DatasetPromotionService` resolves a trip to a route by `routeExternalId`
 * and a stop time to a stop by `stopExternalId`, throws on either miss, and
 * does the whole promotion in one transaction — so a single unresolvable row
 * means *nothing* reaches the rider-facing tables. Both misses are reachable
 * from a partial crawl:
 *
 *  - a route whose stop lookup failed still returns a timetable, so trips
 *    exist for a route pattern that was never built;
 *  - the timetable's terminal ids come from the route list, not from the
 *    crawled stop list, so a terminus can name a station this dataset never
 *    collected.
 *
 * Resolution is against *this dataset's* nodes, not the whole stops table:
 * that is what promotion itself does, so a stop promoted by an earlier run
 * does not count.
 *
 * Returns the survivors plus what was dropped, so a caller can report the
 * tally rather than silently shipping a thinner file.
 */
export function landableTrips(
  trips: CanonicalTrip[],
  nodes: Pick<CanonicalMobilityNode, 'externalId'>[],
  routePatterns: Pick<CanonicalRoutePattern, 'externalId'>[],
): { trips: CanonicalTrip[]; droppedTrips: number; droppedStopTimes: number } {
  const nodeIds = new Set(nodes.map(node => node.externalId));
  const routeIds = new Set(routePatterns.map(pattern => pattern.externalId));

  let droppedTrips = 0;
  let droppedStopTimes = 0;
  const kept: CanonicalTrip[] = [];

  for (const trip of trips) {
    if (!routeIds.has(trip.routeExternalId)) {
      droppedTrips++;
      droppedStopTimes += trip.stopTimes.length;
      continue;
    }

    const stopTimes = trip.stopTimes.filter(stopTime =>
      nodeIds.has(stopTime.stopExternalId),
    );
    droppedStopTimes += trip.stopTimes.length - stopTimes.length;

    if (!stopTimes.length) {
      droppedTrips++;
      continue;
    }

    kept.push({
      ...trip,
      stopTimes: stopTimes.map((stopTime, i) => ({ ...stopTime, sequence: i + 1 })),
    });
  }

  return { trips: kept, droppedTrips, droppedStopTimes };
}

/** "06:15", "6:15", "06:15:00" and "0615" all mean the same departure. */
export function normalizeTime(raw?: string | null): string | undefined {
  const value = (raw ?? '').trim();
  if (!value) return undefined;

  const colon = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (colon) {
    const h = Number(colon[1]);
    const m = Number(colon[2]);
    if (h > 27 || m > 59) return undefined;
    return `${String(h).padStart(2, '0')}:${colon[2]}`;
  }

  const bare = value.match(/^(\d{2})(\d{2})$/);
  if (bare) {
    const h = Number(bare[1]);
    const m = Number(bare[2]);
    if (h > 27 || m > 59) return undefined;
    return `${bare[1]}:${bare[2]}`;
  }

  return undefined;
}

/**
 * One scheduled trip.
 *
 * `timeIsEstimated` is **false** throughout: every time here is one BMTC
 * published, not one we interpolated. That flag is what the app reads to
 * decide whether to caption a departure as an estimate, so setting it wrongly
 * would present a guess as a promise.
 *
 * Trips whose `tripdetails` are missing still produce a trip with the two
 * times BMTC does give — first and last call. Half a timetable is worth more
 * to a rider than none, and the missing middle is visible as absent stops
 * rather than invented ones.
 */
export function toTrip(
  route: BmtcRoute,
  trip: BmtcTrip,
  index: number,
  serviceClass: ServiceClass = 'UNKNOWN',
): CanonicalTrip | null {
  const details = trip.tripdetails ?? [];
  let stopTimes: CanonicalStopTime[] = [];

  if (details.length) {
    stopTimes = details
      .map((d, i): CanonicalStopTime | null => {
        const at = normalizeTime(d.apptime);
        if (!at || !d.stationname) return null;
        return {
          stopExternalId: d.stationid ? String(d.stationid) : undefined,
          stopName: d.stationname.trim(),
          sequence: d.routeorder ?? i + 1,
          arrivalTime: at,
          departureTime: at,
          timeIsEstimated: false,
        };
      })
      .filter((x): x is CanonicalStopTime => x !== null)
      .sort((a, b) => a.sequence - b.sequence)
      .map((s, i) => ({ ...s, sequence: i + 1 }));
  } else {
    const start = normalizeTime(trip.starttime);
    const end = normalizeTime(trip.endtime);
    // The station *ids* matter as much as the times. Promotion resolves a stop
    // time to a stop by `stopExternalId` alone and throws when it cannot — and
    // one unresolvable row aborts the entire promotion transaction, so nothing
    // reaches the rider-facing tables. This branch used to emit the terminal
    // names without their ids, which is what failed the first adapter run
    // ("stop time cannot be mapped: 1657-0:1"). Every route in the route list
    // carries both ids, so there is nothing to guess.
    if (start && route.fromstation) {
      stopTimes.push({
        stopExternalId:
          route.fromstationid !== undefined ? String(route.fromstationid) : undefined,
        stopName: route.fromstation.trim(),
        sequence: 1,
        departureTime: start,
        timeIsEstimated: false,
      });
    }
    if (end && route.tostation) {
      stopTimes.push({
        stopExternalId:
          route.tostationid !== undefined ? String(route.tostationid) : undefined,
        stopName: route.tostation.trim(),
        sequence: stopTimes.length + 1,
        arrivalTime: end,
        timeIsEstimated: false,
      });
    }
  }

  // A call with no station id cannot be promoted — it would abort the whole
  // transaction on arrival. Dropping it here costs one departure; letting it
  // through costs the entire import.
  stopTimes = stopTimes
    .filter(stopTime => stopTime.stopExternalId)
    .map((stopTime, i) => ({ ...stopTime, sequence: i + 1 }));

  // A trip with nothing timed is not a trip. Emitting it would inflate the
  // route's trip count while telling a rider nothing.
  if (!stopTimes.length) return null;

  return {
    externalId: trip.tripid ? String(trip.tripid) : `${route.routeid}-${index}`,
    providerCode: BMTC_PROVIDER_CODE,
    routeExternalId: String(route.routeid),
    serviceName: route.routeno?.trim(),
    vehicleRegistration: trip.vehicleno?.trim() || undefined,
    operationalStatus: 'ACTIVE',
    serviceClass: serviceClass === 'UNKNOWN' ? serviceClassFor(trip.servicetype) : serviceClass,
    stopTimes,
  };
}
