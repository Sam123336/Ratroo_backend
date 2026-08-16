/**
 * Harvest BMTC routes, stops and timetables into canonical objects.
 *
 *   npm run bmtc:ingest -- --limit 5          # try five routes first
 *   npm run bmtc:ingest                       # everything (large, resumable run)
 *   npm run bmtc:ingest -- --interval 2000    # gentler
 *
 * Writes canonical JSON to `.bmtc-cache/canonical.json` and every raw response
 * to `.bmtc-cache/`. It does **not** write to the database: under
 * `providers/karnataka/bengaluru/README.md` nothing reaches canonical tables
 * until publisher, licence, freshness and permission are verified, and that
 * has not happened for this source. Promotion is a separate, deliberate step.
 *
 * Start with `--limit 5`. The mapper was written against the published spec
 * rather than captured traffic, so the first real responses are also the first
 * honest test of it — and five routes is enough to find out, while ~2,200 is
 * a full run is a lot of load spent proving the same thing.
 */
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { BmtcClient } from "../modules/provider-ingestion/providers/bmtc/bmtc-official.client";
import {
  BMTC_AGENCY,
  serviceClassLookup,
  toNode,
  toRoutePattern,
  toTrip,
  tripsFromVehicleDetails,
  landableTrips,
} from "../modules/provider-ingestion/providers/bmtc/bmtc-official.mapper";
import {
  BmtcRouteDetailsResponse,
  BmtcRouteListResponse,
  BmtcRouteSearchResponse,
  BmtcServiceTypesResponse,
  BmtcTimetableResponse,
  envelopeOk,
  timetableTrips,
} from "../modules/provider-ingestion/providers/bmtc/bmtc-official.types";
import {
  CanonicalMobilityNode,
  CanonicalRoutePattern,
  CanonicalTrip,
  ServiceClass,
} from "../modules/provider-ingestion/domain/canonical-mobility";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const CACHE_DIR = join(process.cwd(), ".bmtc-cache");
const limit = Number(arg("limit") ?? "0");
const interval = Number(arg("interval") ?? "1000");

function routeNumber(routeno: string): string {
  return routeno.replace(/\s+(UP|DOWN)$/i, "").trim();
}

function todayInBengaluru(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true });
  const log = (m: string) => console.log(m);
  const client = new BmtcClient({
    cacheDir: CACHE_DIR,
    minIntervalMs: interval,
    onProgress: log,
  });

  log(`BMTC ingest — ${interval}ms between requests, cache ${CACHE_DIR}`);
  if (limit) log(`Limited to ${limit} routes.`);

  // 1. Service classes, so trips can be typed as Vajra / Vayu Vajra / feeder.
  const types =
    await client.post<BmtcServiceTypesResponse>("GetAllServiceTypes");
  if (!envelopeOk(types.body))
    throw new Error("GetAllServiceTypes returned issuccess=false");
  const classByType = serviceClassLookup(types.body.data ?? []);
  log(`Service types: ${types.body.data?.length ?? 0}`);

  // 2. Every route. One entry per direction.
  const routes = await client.post<BmtcRouteListResponse>("GetAllRouteList");
  if (!envelopeOk(routes.body))
    throw new Error("GetAllRouteList returned issuccess=false");
  const all = routes.body.data ?? [];
  const selected = limit > 0 ? all.slice(0, limit) : all;
  log(`Routes: ${all.length} total, processing ${selected.length}`);

  const nodes = new Map<string, CanonicalMobilityNode>();
  const patterns: CanonicalRoutePattern[] = [];
  const trips: CanonicalTrip[] = [];
  const failures: Array<{ routeid: number; step: string; error: string }> = [];
  const parentByRouteNumber = new Map<string, number>();
  const detailsByParent = new Map<number, BmtcRouteDetailsResponse>();
  let timedRoutes = 0;
  let vehicleTimedRoutes = 0;
  const serviceDate = todayInBengaluru();

  for (const [index, route] of selected.entries()) {
    const label = `[${index + 1}/${selected.length}] ${route.routeno ?? route.routeid}`;

    let stops: BmtcRouteDetailsResponse["data"] = [];
    let patterned = false;
    try {
      const number = routeNumber(route.routeno);
      let parentId = parentByRouteNumber.get(number);
      if (!parentId) {
        // Half of BMTC's route numbers carry the terminal pair as well as the
        // number — "335-E SNBS-KDG", not "335-E". The search matches on the
        // number alone, so querying the whole string returns nothing while
        // querying "335-E" returns every variant, this one included. Searching
        // the full string is what failed 4,658 of 9,918 routes on the first
        // harvest. Query the leading token, then still require an exact match
        // on the full name so a sibling variant is never silently substituted.
        const token = number.split(/\s+/)[0];
        const search = await client.post<BmtcRouteSearchResponse>(
          "SearchRoute_v2",
          {
            routetext: token,
          },
        );
        const candidates = search.body.data ?? [];
        const norm = (value: string) => value.trim().toLowerCase();
        const exact =
          candidates.find((candidate) => norm(candidate.routeno) === norm(number)) ??
          // Only when the number is bare and the search echoes it differently.
          // A wrong parent here cannot leak into the output: the stop filter
          // below keeps only stops whose routeid is this directional route, so
          // a mismatched parent yields zero stops and fails loudly.
          candidates.find((candidate) => norm(candidate.routeno) === norm(token));
        if (!exact)
          throw new Error(`No exact parent route match for ${number}`);
        parentId = exact.routeparentid;
        parentByRouteNumber.set(number, parentId);
      }

      let detailBody = detailsByParent.get(parentId);
      if (!detailBody) {
        const details = await client.post<BmtcRouteDetailsResponse>(
          "SearchByRouteDetails_v4",
          {
            routeid: parentId,
            servicetypeid: 0,
          },
        );
        detailBody = details.body;
        detailsByParent.set(parentId, detailBody);
      }
      const directional = [
        ...(detailBody.data ?? detailBody.routedetails ?? []),
        ...(detailBody.up?.data ?? []),
        ...(detailBody.down?.data ?? []),
      ];
      stops = directional.filter(
        (stop) => stop.routeid === undefined || stop.routeid === route.routeid,
      );
      route.routeparentid = parentId;
      if (!stops.length)
        throw new Error(
          `No stops returned for directional route ${route.routeid}`,
        );
      for (const stop of stops) {
        const node = toNode(stop);
        // Keep the richest record: a later route may locate a stop an
        // earlier one left at 0,0.
        const existing = nodes.get(node.externalId!);
        if (
          !existing ||
          (node.latitude !== undefined && existing.latitude === undefined)
        ) {
          nodes.set(node.externalId!, node);
        }
      }
      // The route's class comes from the vehicles actually working it, not
      // from `classByType.get(0)` as this used to read — 0 is not one of the
      // two ids the API issues (72 Non AC/Ordinary, 73 AC), so that lookup
      // missed every time and filed all 9,918 routes as UNKNOWN. Modal rather
      // than first-seen because a route can be worked by both classes and the
      // first vehicle listed is whichever one happens to be nearest the top of
      // the route.
      const classVotes = new Map<ServiceClass, number>();
      for (const stop of stops) {
        for (const vehicle of stop.vehicleDetails ?? []) {
          const id = vehicle.servicetypeid;
          const cls = id !== undefined ? classByType.get(id) : undefined;
          if (cls) classVotes.set(cls, (classVotes.get(cls) ?? 0) + 1);
        }
      }
      const routeClass: ServiceClass =
        [...classVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
        "UNKNOWN";

      patterns.push(toRoutePattern(route, stops, routeClass));
      patterned = true;

      // Per-stop times, from the vehicle blocks the route-details call already
      // returned. This is the only intermediate-stop timing BMTC publishes;
      // the timetable call below gives first and last call only, and gives
      // nothing at all for 83% of routes.
      const fromVehicles = tripsFromVehicleDetails(route, stops);
      if (fromVehicles.length) {
        trips.push(...fromVehicles);
        vehicleTimedRoutes++;
      }
    } catch (error) {
      failures.push({
        routeid: route.routeid,
        step: "stops",
        error: String(error).slice(0, 160),
      });
    }

    // A trip whose route never made it into `patterns` is an orphan, and
    // promotion rejects orphans by throwing — one of them aborts the whole
    // transaction and nothing at all reaches the rider-facing tables. The
    // stops step failing does not stop the timetable step from succeeding, so
    // the last full harvest produced 546 such trips across 273 routes and
    // `bmtc:promote` died on the first one ("cannot be mapped to route:
    // 1735-0"). Skip the timetable rather than emit a trip that cannot land.
    if (!patterned) {
      log(`${label}: no route pattern, skipping timetable`);
      continue;
    }

    try {
      const timetable = await client.post<BmtcTimetableResponse>(
        "GetTimetableByRouteid_v3",
        {
          routeid: route.routeid,
          fromStationId: route.fromstationid ?? 0,
          toStationId: route.tostationid ?? 0,
          current_date: serviceDate,
          starttime: `${serviceDate} 00:00`,
          endtime: `${serviceDate} 23:59`,
        },
      );
      const raw = timetableTrips(timetable.body);
      // `servicetypeid` is declared on the timetable shape but the live
      // deployment never sends it, so this resolves to UNKNOWN and [toTrip]
      // falls back to the trip's own `servicetype` string. Left as the lookup
      // rather than deleted: a deployment that does send it should be used.
      const mapped = raw
        .map((t, i) =>
          toTrip(
            route,
            t,
            i,
            classByType.get(t.servicetypeid ?? -1) ?? "UNKNOWN",
          ),
        )
        .filter((t): t is CanonicalTrip => t !== null);
      trips.push(...mapped);
      if (mapped.length) timedRoutes++;
      log(`${label}: ${stops.length} stops, ${mapped.length} trips`);
    } catch (error) {
      failures.push({
        routeid: route.routeid,
        step: "timetable",
        error: String(error).slice(0, 160),
      });
      log(`${label}: ${stops.length} stops, timetable FAILED`);
    }
  }

  // A route whose stop lookup failed still has a timetable, so the loop above
  // can emit trips for a route pattern that was never built. Promotion refuses
  // the whole dataset on the first such trip — correctly, a trip with no route
  // is not publishable — so drop them here rather than shipping a file that
  // cannot be promoted. Filtering on the pattern set rather than on "did the
  // stops step throw" catches every orphan cause, not just that one.
  //
  // Shared with the adapter rather than reimplemented: it also drops a stop
  // time whose station this dataset never collected, which promotion refuses
  // the same way. The timetable's terminal ids come from the route list, not
  // from the crawled stop list, so a terminus can name a station that is not
  // in `nodes` — that is what failed the first adapter run.
  const canonicalNodes = [...nodes.values()];
  const landable = landableTrips(trips, canonicalNodes, patterns);
  const usableTrips = landable.trips;

  const out = {
    generatedAt: new Date().toISOString(),
    source:
      "Official Namma BMTC commuter backend. Usage/licence not yet cleared for canonical promotion.",
    agency: BMTC_AGENCY,
    counts: {
      routesProcessed: selected.length,
      routesWithAnyTime: timedRoutes,
      routesWithPerStopTimes: vehicleTimedRoutes,
      stops: nodes.size,
      patterns: patterns.length,
      trips: usableTrips.length,
      orphanTripsDropped: landable.droppedTrips,
      unlandableStopTimesDropped: landable.droppedStopTimes,
      failures: failures.length,
    },
    nodes: canonicalNodes,
    routePatterns: patterns,
    trips: usableTrips,
    failures,
  };
  const outPath = join(CACHE_DIR, "canonical.json");
  writeFileSync(outPath, JSON.stringify(out, null, 2));

  log("");
  log(`stops              ${nodes.size}`);
  log(`route patterns     ${patterns.length}`);
  log(`trips              ${usableTrips.length}`);
  log(`trips dropped      ${landable.droppedTrips}   (route pattern never built, or no landable call)`);
  log(`stop times dropped ${landable.droppedStopTimes}   (station not in this dataset)`);
  log(`routes with times  ${timedRoutes}/${selected.length}   (first+last call)`);
  log(`  of which per-stop ${vehicleTimedRoutes}/${selected.length}   (from vehicleDetails)`);
  log(`failures           ${failures.length}`);
  log(`→ ${outPath}`);
  log("");
  log("Nothing was written to the database. Promotion is gated on the licence");
  log("question in providers/karnataka/bengaluru/README.md.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
