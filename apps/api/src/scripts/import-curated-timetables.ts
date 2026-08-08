/**
 * Import hand-curated timetables for services with no machine-readable source.
 *
 *   npm run timetables:curated -- --dry    # validate and report, write nothing
 *   npm run timetables:curated             # apply
 *
 * Tram, ferry and suburban rail publish nothing scrapeable: the WBTC and CTC
 * pages carry press notices and memo numbers, not schedules. The only honest
 * way to get their times is to enter them from a cited source — a depot board,
 * an official notice, an operator PDF.
 *
 * Two shapes are supported per route, in `src/database/seeds/curated-timetables.json`:
 *
 *   headwayMinutes + firstDeparture + lastDeparture
 *     For frequency services ("a ferry every 20 min, 06:00–20:00"). Departures
 *     are generated across the window. This is how ferries and trams actually
 *     run, and claiming exact per-stop clock times for them would be fiction.
 *
 *   departures: ["06:10", "07:25", ...]
 *     For scheduled services such as suburban rail, where specific trains run
 *     at specific times.
 *
 * Times land on the route's first stop and are spread across later stops by the
 * existing interpolation pass, so run `npm run timetables:interpolate` after.
 *
 * Everything written is marked `timeSource = 'OFFICIAL'` — distinct from
 * SCRAPED (read off a provider page) and INTERPOLATED (estimated). A route with
 * no `source` string is refused: an uncited timing is a guess wearing a badge.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { QueryTypes, Sequelize } from 'sequelize';
import { postgresConnection, processEnvLookup } from '../database/connection-options';

config({ path: resolve(__dirname, '../../../../.env') });

const DRY_RUN = process.argv.includes('--dry');
const SEED_PATH = resolve(__dirname, '../database/seeds/curated-timetables.json');

interface CuratedRoute {
  routeId: string;
  providerCode: string;
  name: string;
  source: string | null;
  firstDeparture: string | null;
  lastDeparture: string | null;
  headwayMinutes: number | null;
  departures: string[];
}

function toMinutes(value: string): number | null {
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h > 23 || min > 59 ? null : h * 60 + min;
}

const toHHMM = (mins: number) =>
  `${String(Math.floor((mins % 1440) / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

/** Departure clock times for one route, from either shape. */
function departuresFor(route: CuratedRoute): string[] {
  if (route.departures?.length) {
    return route.departures.filter(d => toMinutes(d) !== null);
  }

  const first = route.firstDeparture ? toMinutes(route.firstDeparture) : null;
  const last = route.lastDeparture ? toMinutes(route.lastDeparture) : null;
  const headway = route.headwayMinutes;

  if (first === null || last === null || !headway || headway <= 0 || last <= first) {
    return [];
  }

  const out: string[] = [];
  for (let t = first; t <= last; t += headway) out.push(toHHMM(t));
  return out;
}

async function main() {
  const seed = JSON.parse(readFileSync(SEED_PATH, 'utf8')) as { routes: CuratedRoute[] };
  const sequelize = new Sequelize({
    dialect: 'postgres',
    logging: false,
    ...postgresConnection(processEnvLookup),
  } as never);

  // --- preflight: reconcile the seed against the live database ------------
  //
  // The seed is a file on disk and the network changes underneath it. Writing
  // without checking risks updating a route that has been renamed or removed,
  // or silently ignoring one that was added. Nothing is written until this
  // reconciliation has been reported.
  const live = await sequelize.query<{ id: string; providerCode: string; longName: string; trips: number }>(
    `SELECT br.id, br."providerCode", br."longName",
            count(bt.id)::int AS trips
     FROM bus_routes br
     LEFT JOIN bus_trips bt ON bt."routeId" = br.id
     WHERE br."providerCode" IN ('KOLKATA_TRAM', 'WB_FERRY', 'EASTERN_RAILWAY_SUBURBAN')
     GROUP BY br.id, br."providerCode", br."longName"`,
    { type: QueryTypes.SELECT },
  );

  const liveById = new Map(live.map(r => [r.id, r]));
  const seedIds = new Set(seed.routes.map(r => r.routeId));

  const stale = seed.routes.filter(r => !liveById.has(r.routeId));
  const missing = live.filter(r => !seedIds.has(r.id));
  const renamed = seed.routes.filter(r => {
    const l = liveById.get(r.routeId);
    return l && l.longName !== r.name;
  });
  const noTrips = live.filter(r => r.trips === 0);

  console.log(`seed routes: ${seed.routes.length}   live routes: ${live.length}   ` +
    `live with trips: ${live.filter(r => r.trips > 0).length}`);

  const report = (label: string, items: string[]) => {
    if (!items.length) return;
    console.log(`\n${label} (${items.length}):`);
    items.forEach(i => console.log(`   ${i}`));
  };

  report('in seed but NOT in database (stale — will be skipped)',
    stale.map(r => `${r.providerCode}: ${r.name}`));
  report('in database but NOT in seed (missing — add them)',
    missing.map(r => `${r.providerCode}: ${r.longName}`));
  report('renamed upstream (seed name is out of date)',
    renamed.map(r => `${r.name}  ->  ${liveById.get(r.routeId)!.longName}`));
  report('no trip rows — cannot attach a departure until the route has trips',
    noTrips.map(r => `${r.providerCode}: ${r.longName}`));

  if (stale.length || renamed.length) {
    console.log('\nRegenerate the seed before writing, or fix the entries above.');
  }

  console.log('');

  let applied = 0;
  const skipped: string[] = [];

  for (const route of seed.routes) {
    const departures = departuresFor(route);

    if (!departures.length) {
      skipped.push(`${route.providerCode}: ${route.name} — no timings entered`);
      continue;
    }

    // An uncited timing is indistinguishable from an invented one.
    if (!route.source?.trim()) {
      skipped.push(`${route.providerCode}: ${route.name} — timings present but no "source" cited`);
      continue;
    }

    // First stop of the route carries the departure; interpolation fills the rest.
    const [firstStop] = await sequelize.query<{ id: string }>(
      `SELECT bst.id
       FROM bus_stop_times bst
       JOIN bus_trips bt ON bt.id = bst."tripId"
       WHERE bt."routeId" = :routeId
       ORDER BY bst.sequence ASC
       LIMIT 1`,
      { replacements: { routeId: route.routeId }, type: QueryTypes.SELECT },
    );

    if (!firstStop) {
      skipped.push(`${route.providerCode}: ${route.name} — no trip/stop rows to attach to`);
      continue;
    }

    console.log(
      `${route.providerCode.padEnd(26)} ${route.name.slice(0, 44).padEnd(46)} ` +
        `${departures.length} departure(s)  [${route.source}]`,
    );

    if (!DRY_RUN) {
      await sequelize.query(
        `UPDATE bus_stop_times
         SET "arrivalTime" = :time, "departureTime" = :time,
             "timeSource" = 'OFFICIAL', "updatedAt" = now()
         WHERE id = :id`,
        { replacements: { id: firstStop.id, time: departures[0] }, type: QueryTypes.UPDATE },
      );
    }

    applied++;
  }

  console.log(`\nroutes with usable timings: ${applied}`);
  console.log(`routes skipped            : ${skipped.length}`);
  skipped.forEach(s => console.log(`   ${s}`));

  if (stale.length || renamed.length) {
    console.log('\nNOT WRITTEN: the seed disagrees with the live network (see above).');
    console.log('Regenerate it, or correct the stale/renamed entries, then re-run.');
    await sequelize.close();
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('\n--dry: nothing written.');
  } else if (applied) {
    console.log('\nNext: npm run timetables:interpolate, then POST /internal/cron/project-transit');
  }

  await sequelize.close();
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
