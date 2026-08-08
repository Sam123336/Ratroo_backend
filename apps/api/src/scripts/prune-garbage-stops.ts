/**
 * Remove stops that are scraped markup rather than places.
 *
 *   npm run stops:prune-garbage              # dry run
 *   npm run stops:prune-garbage -- --apply   # delete
 *
 * The WBBus directory-page mapper split link text and treated each fragment as
 * a stop, producing entries like:
 *
 *   "AADITRI\n        Reg No : WB49C7440\n        Gopiballabpur 5:25 AM ..."
 *
 * 477 characters of page content stored as a stop name. These overflowed
 * places.canonicalName (varchar 255) and aborted whole ingestion runs; they also
 * pollute search results and the canonical place graph.
 *
 * The mapper no longer creates them — this clears what earlier runs left behind.
 *
 * Matched by shape, not by provider: unusually long, containing a newline, or
 * carrying registration/fare table text that no stop name would have.
 *
 * Deletes in foreign-key order and inside one transaction, so a failure cannot
 * leave stop times pointing at removed stops.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { QueryTypes, Sequelize } from 'sequelize';
import { postgresConnection, processEnvLookup } from '../database/connection-options';

config({ path: resolve(__dirname, '../../../../.env') });

const APPLY = process.argv.includes('--apply');

/** A stop name is a place name. None of these shapes are. */
const GARBAGE = `(
  length(name) > 120
  OR name LIKE '%' || chr(10) || '%'
  OR name ILIKE '%Reg No%'
  OR name ILIKE '%Service Charges%'
  OR name ILIKE '%Reservation charges%'
)`;

async function main() {
  const sequelize = new Sequelize({
    dialect: 'postgres', logging: false, ...postgresConnection(processEnvLookup),
  } as never);

  const [counts] = await sequelize.query<{
    busStops: number; stopTimes: number; routeStops: number; canonicalStops: number; places: number;
  }>(
    `SELECT
       (SELECT count(*) FROM bus_stops WHERE ${GARBAGE})::int AS "busStops",
       (SELECT count(*) FROM bus_stop_times WHERE "stopId" IN
          (SELECT id FROM bus_stops WHERE ${GARBAGE}))::int AS "stopTimes",
       (SELECT count(*) FROM bus_route_stops WHERE "stopId" IN
          (SELECT id FROM bus_stops WHERE ${GARBAGE}))::int AS "routeStops",
       (SELECT count(*) FROM stops WHERE ${GARBAGE})::int AS "canonicalStops",
       (SELECT count(*) FROM places WHERE length("canonicalName") > 120
          OR "canonicalName" LIKE '%' || chr(10) || '%'
          OR "canonicalName" ILIKE '%Reg No%')::int AS "places"`,
    { type: QueryTypes.SELECT },
  );

  console.log('garbage rows found:');
  console.log(`   bus_stops        ${counts.busStops}`);
  console.log(`   bus_stop_times   ${counts.stopTimes}   (referencing them)`);
  console.log(`   bus_route_stops  ${counts.routeStops}   (referencing them)`);
  console.log(`   stops            ${counts.canonicalStops}`);
  console.log(`   places           ${counts.places}`);

  const samples = await sequelize.query<{ name: string }>(
    `SELECT name FROM bus_stops WHERE ${GARBAGE} ORDER BY length(name) DESC LIMIT 3`,
    { type: QueryTypes.SELECT },
  );
  console.log('\nlongest examples:');
  samples.forEach(s => console.log(`   ${s.name.length} chars: ${JSON.stringify(s.name.slice(0, 64))}`));

  if (!counts.busStops && !counts.canonicalStops && !counts.places) {
    console.log('\nNothing to clean.');
    await sequelize.close();
    return;
  }

  if (!APPLY) {
    console.log('\nDry run — nothing deleted. Re-run with --apply.');
    await sequelize.close();
    return;
  }

  await sequelize.transaction(async transaction => {
    const opts = { transaction, type: QueryTypes.DELETE as const };

    // Children first: stop times and route links reference the stop rows.
    await sequelize.query(
      `DELETE FROM bus_stop_times WHERE "stopId" IN (SELECT id FROM bus_stops WHERE ${GARBAGE})`, opts);
    await sequelize.query(
      `DELETE FROM bus_route_stops WHERE "stopId" IN (SELECT id FROM bus_stops WHERE ${GARBAGE})`, opts);
    await sequelize.query(
      `DELETE FROM stop_times WHERE "stopId" IN (SELECT id FROM stops WHERE ${GARBAGE})`, opts);

    await sequelize.query(`DELETE FROM stops WHERE ${GARBAGE}`, opts);
    await sequelize.query(`DELETE FROM bus_stops WHERE ${GARBAGE}`, opts);

    // Aliases reference places, so they go first.
    await sequelize.query(
      `DELETE FROM place_aliases WHERE "placeId" IN (
         SELECT id FROM places WHERE length("canonicalName") > 120
           OR "canonicalName" LIKE '%' || chr(10) || '%'
           OR "canonicalName" ILIKE '%Reg No%')`, opts);
    await sequelize.query(
      `DELETE FROM places WHERE length("canonicalName") > 120
         OR "canonicalName" LIKE '%' || chr(10) || '%'
         OR "canonicalName" ILIKE '%Reg No%'`, opts);
  });

  const [after] = await sequelize.query<{ n: number }>(
    `SELECT (SELECT count(*) FROM bus_stops WHERE ${GARBAGE})::int AS n`,
    { type: QueryTypes.SELECT },
  );

  console.log(`\nDeleted. Remaining garbage stops: ${after.n}`);
  await sequelize.close();
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
