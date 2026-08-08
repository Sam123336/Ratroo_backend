/**
 * Remove orphan routes left by an earlier experimental import.
 *
 *   npm run routes:prune                 # dry run — reports, deletes nothing
 *   npm run routes:prune -- --apply      # delete
 *   npm run routes:prune -- --apply --keep exp_eastern_railway_suburban_local_37311
 *
 * These are identifiable by an `externalId` of the form `exp_*`, as opposed to
 * the `<provider>:route:<n>:<from>:<to>` form the real seed network uses. Every
 * one of them carries exactly two stops — the endpoints only, no intermediate
 * stations — and no trips at all. They are stubs that duplicate working routes:
 *
 *   exp_wb_ferry_ferry_02   "Fairlie Place Ghat to Howrah Ghat"
 *                           duplicates "Howrah to Fairlie" (which has trips)
 *
 * They surface in the app as duplicate search results that lead to empty pages.
 *
 * Two safety conditions, both required, so this can never touch a real route:
 *   1. externalId matches exp_*
 *   2. the route has zero trips
 *
 * Deletion order respects the foreign keys: route-stop links, then the
 * projected canonical row, then the source row.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { QueryTypes, Sequelize } from 'sequelize';
import { postgresConnection, processEnvLookup } from '../database/connection-options';

config({ path: resolve(__dirname, '../../../../.env') });

const APPLY = process.argv.includes('--apply');
const keepIndex = process.argv.indexOf('--keep');
const KEEP = new Set(keepIndex === -1 ? [] : process.argv.slice(keepIndex + 1).filter(a => !a.startsWith('--')));

async function main() {
  const sequelize = new Sequelize({
    dialect: 'postgres',
    logging: false,
    ...postgresConnection(processEnvLookup),
  } as never);

  const candidates = await sequelize.query<{
    id: string; providerCode: string; longName: string; externalId: string; stops: number;
  }>(
    `SELECT br.id, br."providerCode", br."longName", br."externalId",
            count(brs.id)::int AS stops
     FROM bus_routes br
     LEFT JOIN bus_route_stops brs ON brs."routeId" = br.id
     WHERE br."externalId" LIKE 'exp\\_%'
       AND NOT EXISTS (SELECT 1 FROM bus_trips bt WHERE bt."routeId" = br.id)
     GROUP BY br.id, br."providerCode", br."longName", br."externalId"
     ORDER BY br."providerCode", br."longName"`,
    { type: QueryTypes.SELECT },
  );

  const targets = candidates.filter(c => !KEEP.has(c.externalId));
  const kept = candidates.filter(c => KEEP.has(c.externalId));

  console.log(`orphan exp_* routes found: ${candidates.length}\n`);
  targets.forEach(t =>
    console.log(`  DELETE  ${t.providerCode.padEnd(26)} ${t.longName.slice(0, 46).padEnd(48)} ` +
      `stops=${t.stops}  ${t.externalId}`));
  kept.forEach(k =>
    console.log(`  KEEP    ${k.providerCode.padEnd(26)} ${k.longName.slice(0, 46).padEnd(48)} ` +
      `stops=${k.stops}  ${k.externalId}`));

  if (!targets.length) {
    console.log('\nNothing to delete.');
    await sequelize.close();
    return;
  }

  if (!APPLY) {
    console.log(`\nDry run — nothing deleted. Re-run with --apply to remove ${targets.length} route(s).`);
    await sequelize.close();
    return;
  }

  const ids = targets.map(t => t.id);

  // One transaction: a half-pruned route would leave dangling stop links.
  await sequelize.transaction(async transaction => {
    const opts = { replacements: { ids }, transaction, type: QueryTypes.DELETE as const };

    await sequelize.query('DELETE FROM bus_route_stops WHERE "routeId" IN (:ids)', opts);
    // The projected copy the app actually reads.
    await sequelize.query('DELETE FROM routes WHERE id IN (:ids)', opts);
    await sequelize.query('DELETE FROM bus_routes WHERE id IN (:ids)', opts);
  });

  const [after] = await sequelize.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM bus_routes WHERE "externalId" LIKE 'exp\\_%'`,
    { type: QueryTypes.SELECT },
  );

  console.log(`\nDeleted ${targets.length} route(s). Remaining exp_* routes: ${after.n}`);
  console.log('Re-run the projection to sync the canonical tables: POST /internal/cron/project-transit');

  await sequelize.close();
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
