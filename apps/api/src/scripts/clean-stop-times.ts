/**
 * Normalise stop_times to one row per stop with one time format.
 *
 *   npm run stoptimes:clean -- --dry
 *   npm run stoptimes:clean
 *
 * Two defects, both introduced by re-running ingestion over existing trips:
 *
 * 1. Duplicates. 808 trips hold two rows for the same (stop, sequence): one
 *    carrying the time, one with departureTime NULL. The app rendered both, so
 *    a route's stop list read "Santragachi 21:15 / Santragachi —".
 *
 * 2. Mixed formats. Times are stored as "21:15", "4:25 AM" and "05:55:00".
 *    Everything downstream compares them as strings, so "4:25 AM" sorts after
 *    "21:15" and the app's HH:MM parser rejects it outright — those departures
 *    silently vanished from "upcoming".
 *
 * Both are repaired in place. Nothing is invented: the AM/PM and HH:MM:SS
 * values convert exactly, and de-duplication keeps the row that already holds
 * the better data.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { QueryTypes, Sequelize } from 'sequelize';
import { postgresConnection, processEnvLookup } from '../database/connection-options';

config({ path: resolve(__dirname, '../../../../.env') });

const DRY_RUN = process.argv.includes('--dry');

/** "4:25 AM" / "12:05 PM" / "05:55:00" / "21:15" -> "HH:MM", or null if unrecognised. */
export function normaliseTime(raw: string | null): string | null {
  if (!raw) return null;

  const value = raw.trim();
  const pad = (n: number) => n.toString().padStart(2, '0');

  const meridiem = /^(\d{1,2}):(\d{2})\s*([AP])M$/i.exec(value);
  if (meridiem) {
    const minutes = Number(meridiem[2]);
    let hours = Number(meridiem[1]) % 12;
    if (meridiem[3].toUpperCase() === 'P') hours += 12;
    if (minutes > 59) return null;
    return `${pad(hours)}:${pad(minutes)}`;
  }

  const withSeconds = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(value);
  if (withSeconds) {
    const hours = Number(withSeconds[1]);
    const minutes = Number(withSeconds[2]);
    if (hours > 23 || minutes > 59) return null;
    return `${pad(hours)}:${pad(minutes)}`;
  }

  const plain = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (plain) {
    const hours = Number(plain[1]);
    const minutes = Number(plain[2]);
    if (hours > 23 || minutes > 59) return null;
    return `${pad(hours)}:${pad(minutes)}`;
  }

  return null;
}

/**
 * `npm run stoptimes:clean -- --selftest` — no database needed.
 *
 * The repo has no TypeScript test runner configured, and a wrong conversion
 * here moves a bus by twelve hours, so the check ships with the code.
 */
function selfTest() {
  const cases: Array<[string | null, string | null]> = [
    ['4:25 AM', '04:25'],
    ['1:05 PM', '13:05'],
    ['12:30 AM', '00:30'], // midnight is 00, not 12
    ['12:30 PM', '12:30'], // noon stays 12
    ['11:59 PM', '23:59'],
    ['05:55:00', '05:55'],
    ['7:30:00', '07:30'],
    ['21:15', '21:15'],
    ['9:05', '09:05'],
    [null, null],
    ['_ _ : _ _', null],
    ['25:00', null],
    ['10:75', null],
    ['soon', null],
  ];

  for (const [input, expected] of cases) {
    const actual = normaliseTime(input);
    if (actual !== expected) {
      throw new Error(`normaliseTime(${JSON.stringify(input)}) = ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    }
  }

  console.log(`normaliseTime: ${cases.length} cases pass.`);
}

async function main() {
  if (process.argv.includes('--selftest')) {
    selfTest();
    return;
  }

  const sequelize = new Sequelize({
    dialect: 'postgres', logging: false, ...postgresConnection(processEnvLookup),
  } as never);
  await sequelize.authenticate();

  // ---- 1. formats -------------------------------------------------------
  const odd = await sequelize.query<{ id: string; departureTime: string | null; arrivalTime: string | null }>(
    `SELECT id, "departureTime", "arrivalTime" FROM stop_times
     WHERE ("departureTime" IS NOT NULL AND "departureTime" !~ '^[0-9]{2}:[0-9]{2}$')
        OR ("arrivalTime" IS NOT NULL AND "arrivalTime" !~ '^[0-9]{2}:[0-9]{2}$')`,
    { type: QueryTypes.SELECT },
  );

  let reformatted = 0;
  let unrecognised = 0;

  for (const row of odd) {
    const departure = normaliseTime(row.departureTime);
    const arrival = normaliseTime(row.arrivalTime);

    // A value we cannot read is left untouched rather than nulled — losing a
    // time we simply failed to parse would be worse than storing it oddly.
    if (row.departureTime && !departure) { unrecognised++; continue; }
    if (row.arrivalTime && !arrival) { unrecognised++; continue; }

    if (!DRY_RUN) {
      await sequelize.query(
        `UPDATE stop_times SET "departureTime" = :departure, "arrivalTime" = :arrival WHERE id = :id`,
        { replacements: { id: row.id, departure, arrival }, type: QueryTypes.UPDATE },
      );
    }
    reformatted++;
  }

  // ---- 2. duplicates ----------------------------------------------------
  // Keep the richest row per (trip, stop, sequence): a real time beats NULL,
  // and an operator's own time beats an interpolated one.
  const duplicateSql = `
    WITH ranked AS (
      SELECT id,
             row_number() OVER (
               PARTITION BY "tripId", "stopId", "stopSequence"
               ORDER BY ("departureTime" IS NULL),
                        ("timeSource" IS DISTINCT FROM 'SCRAPED'),
                        id
             ) AS rank
      FROM stop_times
    )
    SELECT id FROM ranked WHERE rank > 1`;

  const duplicates = await sequelize.query<{ id: string }>(duplicateSql, { type: QueryTypes.SELECT });

  if (!DRY_RUN && duplicates.length) {
    await sequelize.query(`DELETE FROM stop_times WHERE id IN (${duplicateSql})`);
  }

  console.log(DRY_RUN ? '\nWould change:' : '\nChanged:');
  console.log(`  times reformatted to HH:MM : ${reformatted}`);
  console.log(`  times left alone (unreadable) : ${unrecognised}`);
  console.log(`  duplicate rows removed : ${duplicates.length}`);

  await sequelize.close();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
