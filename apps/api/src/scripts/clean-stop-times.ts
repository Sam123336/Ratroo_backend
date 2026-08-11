/**
 * Normalise stop_times to one row per stop with one time format.
 *
 *   npm run stoptimes:clean -- --dry
 *   npm run stoptimes:clean
 *
 * The time conversions are covered by clean-stop-times.spec.ts.
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



async function main() {
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

// Only when run as a script. The spec imports normaliseTime, and importing
// this file must not open a database connection.
if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
