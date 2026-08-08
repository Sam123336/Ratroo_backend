/**
 * Fill in missing stop times between stops that do have them.
 *
 *   npm run timetables:interpolate            # apply
 *   npm run timetables:interpolate -- --dry   # report only, change nothing
 *
 * Providers publish times at a handful of stops per route and print "_ _" for
 * the rest. Between any two timed stops the intermediate times can be estimated
 * by how far along the route each stop sits — the same trick GTFS builders use.
 *
 * Distance-weighted, not evenly spaced: stops are not equidistant, so dividing
 * the gap equally would put a bus at the wrong place for most of the journey.
 *
 * Every value written is marked `timeSource = 'INTERPOLATED'`. These are
 * estimates and must be labelled as such wherever they are shown — they are not
 * operator timetables.
 *
 * Only fills gaps BETWEEN anchors. It never extrapolates before the first or
 * after the last timed stop, because that needs an assumed speed and would be
 * inventing departure times rather than interpolating them.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { QueryTypes, Sequelize } from 'sequelize';
import { postgresConnection, processEnvLookup } from '../database/connection-options';

config({ path: resolve(__dirname, '../../../../.env') });

const DRY_RUN = process.argv.includes('--dry');

interface StopTimeRow {
  id: string;
  tripId: string;
  sequence: number;
  arrivalTime: string | null;
  lat: string | null;
  lng: string | null;
}

/** "HH:MM" or "HH:MM:SS" -> minutes past midnight. */
function toMinutes(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
}

function toHHMM(totalMinutes: number): string {
  // Past midnight wraps — a night bus leaving 23:40 arrives 00:15.
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = Math.round(wrapped % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

async function main() {
  const sequelize = new Sequelize({
    dialect: 'postgres',
    logging: false,
    ...postgresConnection(processEnvLookup),
  } as never);

  const rows = await sequelize.query<StopTimeRow>(
    `SELECT bst.id, bst."tripId", bst.sequence, bst."arrivalTime",
            bs.metadata->>'latitude'  AS lat,
            bs.metadata->>'longitude' AS lng
     FROM bus_stop_times bst
     JOIN bus_stops bs ON bs.id = bst."stopId"
     WHERE bst."tripId" IN (
       SELECT "tripId" FROM bus_stop_times
       GROUP BY "tripId"
       HAVING count(*) FILTER (WHERE "arrivalTime" IS NOT NULL) >= 2
     )
     ORDER BY bst."tripId", bst.sequence`,
    { type: QueryTypes.SELECT },
  );

  const byTrip = new Map<string, StopTimeRow[]>();
  for (const row of rows) {
    const list = byTrip.get(row.tripId) ?? [];
    list.push(row);
    byTrip.set(row.tripId, list);
  }

  const updates: Array<{ id: string; time: string }> = [];
  let skippedNoCoords = 0;
  let skippedBadClock = 0;

  for (const stops of byTrip.values()) {
    const anchors = stops
      .map((s, index) => ({ index, minutes: s.arrivalTime ? toMinutes(s.arrivalTime) : null }))
      .filter((a): a is { index: number; minutes: number } => a.minutes !== null);

    for (let a = 0; a < anchors.length - 1; a++) {
      const from = anchors[a];
      const to = anchors[a + 1];
      if (to.index - from.index < 2) continue; // nothing between them

      // Times must move forward. Allow a midnight wrap, reject anything else —
      // a later stop with an earlier time means the source data is wrong.
      let span = to.minutes - from.minutes;
      if (span < 0) span += 1440;
      if (span <= 0 || span > 24 * 60) {
        skippedBadClock++;
        continue;
      }

      const segment = stops.slice(from.index, to.index + 1);
      const coords = segment.map(s => ({
        lat: s.lat === null ? NaN : Number(s.lat),
        lng: s.lng === null ? NaN : Number(s.lng),
      }));

      if (coords.some(c => !Number.isFinite(c.lat) || !Number.isFinite(c.lng))) {
        skippedNoCoords++;
        continue;
      }

      // Cumulative distance along the segment, used as the weight.
      const cumulative = [0];
      for (let i = 1; i < coords.length; i++) {
        cumulative.push(
          cumulative[i - 1] +
            haversineKm(coords[i - 1].lat, coords[i - 1].lng, coords[i].lat, coords[i].lng),
        );
      }

      const total = cumulative[cumulative.length - 1];

      for (let i = 1; i < segment.length - 1; i++) {
        if (segment[i].arrivalTime) continue; // already known — never overwrite

        // Zero-length segment (duplicate coordinates): fall back to even spacing.
        const fraction = total > 0 ? cumulative[i] / total : i / (segment.length - 1);
        updates.push({ id: segment[i].id, time: toHHMM(from.minutes + span * fraction) });
      }
    }
  }

  console.log(`trips considered      : ${byTrip.size}`);
  console.log(`times to interpolate  : ${updates.length}`);
  console.log(`skipped, no coords    : ${skippedNoCoords} segment(s)`);
  console.log(`skipped, bad clock    : ${skippedBadClock} segment(s)`);

  if (DRY_RUN) {
    console.log('\n--dry: nothing written. Sample:');
    updates.slice(0, 8).forEach(u => console.log(`   ${u.id}  ->  ${u.time}`));
    await sequelize.close();
    return;
  }

  if (updates.length) {
    // One statement rather than N round trips.
    await sequelize.query(
      `UPDATE bus_stop_times AS bst
       SET "arrivalTime" = v.time, "departureTime" = v.time,
           "timeSource" = 'INTERPOLATED', "updatedAt" = now()
       FROM (VALUES ${updates.map((_, i) => `(:id${i}::uuid, :t${i})`).join(',')}) AS v(id, time)
       WHERE bst.id = v.id`,
      {
        replacements: Object.fromEntries(
          updates.flatMap((u, i) => [[`id${i}`, u.id], [`t${i}`, u.time]]),
        ),
        type: QueryTypes.UPDATE,
      },
    );
  }

  const [after] = await sequelize.query<{ scraped: number; interpolated: number; total: number }>(
    `SELECT count(*) FILTER (WHERE "timeSource" = 'SCRAPED')::int      AS scraped,
            count(*) FILTER (WHERE "timeSource" = 'INTERPOLATED')::int AS interpolated,
            count(*)::int                                              AS total
     FROM bus_stop_times`,
    { type: QueryTypes.SELECT },
  );

  console.log(
    `\ncoverage now: ${after.scraped} scraped + ${after.interpolated} interpolated ` +
      `= ${after.scraped + after.interpolated}/${after.total}`,
  );
  console.log('Run the projection to publish: POST /internal/cron/project-transit');

  await sequelize.close();
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
