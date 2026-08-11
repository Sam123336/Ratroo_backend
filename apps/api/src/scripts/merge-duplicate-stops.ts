/**
 * Merge stop records that describe the same physical place.
 *
 *   npm run stops:merge-duplicates              # dry run: prints the plan
 *   npm run stops:merge-duplicates -- --apply   # writes
 *
 * The clustering rules are covered by merge-duplicate-stops.spec.ts.
 *
 * Each operator import creates its own stop row, so one bus stand can exist
 * three times over: "KOLKATA", "Kolkata" and "Kolkata", metres apart, each
 * carrying a different slice of the services that actually leave from there.
 * A rider sees three identical rows and cannot choose between them, and
 * whichever they pick shows a third of the buses.
 *
 * This picks one survivor per cluster, repoints every reference at it, and
 * deletes the emptied rows. Nothing is discarded: the survivor inherits all
 * the services, and every merge is written to a journal file so it can be
 * traced afterwards.
 *
 * Deliberately conservative. Two rows merge only when
 *   - their names normalise to the same key, and
 *   - both carry coordinates, and
 *   - they sit within MERGE_RADIUS_M of each other, and
 *   - they agree on state (where both name one).
 * Operators name stops after the locality, so "Bazar" occurs all over West
 * Bengal. Merging two of those would hide a real stop and its services, which
 * is far worse than the duplication being fixed — hence distance being
 * mandatory rather than a tie-breaker.
 *
 * Not a substitute for resolving stops at ingest time: a later import can
 * recreate the duplicates. CanonicalStopResolutionEngine is where that belongs.
 * This repairs what is already in the database.
 */
import { config } from 'dotenv';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { QueryTypes, Sequelize } from 'sequelize';
import { postgresConnection, processEnvLookup } from '../database/connection-options';

config({ path: resolve(__dirname, '../../../../.env') });

const APPLY = process.argv.includes('--apply');

/**
 * How close two same-named stops must be to count as one place.
 *
 * 150 m covers a bus stand whose operators each pinned a different corner of
 * it, and is well short of the distance between two genuinely different stops
 * that share a locality name.
 */
const MERGE_RADIUS_M = 150;

export interface StopRow {
  id: string;
  name: string;
  latitude: string | null;
  longitude: string | null;
  state: string | null;
  provider: string;
  serviceCount: number;
}

export interface Cluster {
  survivor: StopRow;
  absorbed: StopRow[];
}

/** Case and punctuation carry no meaning here: "C.R. Ave" and "CR AVE" are one name. */
export function nameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Metres between two points on a sphere. Good enough at these distances. */
export function metresBetween(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Groups rows that are the same place.
 *
 * Greedy single-link clustering against each cluster's survivor rather than
 * its centroid: a moving centroid lets a chain of stops 140 m apart drag a
 * cluster across a kilometre, quietly merging stops that were never close to
 * each other.
 */
export function clusterStops(rows: StopRow[], radius = MERGE_RADIUS_M): Cluster[] {
  const byKey = new Map<string, StopRow[]>();
  for (const row of rows) {
    const key = nameKey(row.name);
    if (!key) continue;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(row);
    else byKey.set(key, [row]);
  }

  const clusters: Cluster[] = [];

  for (const bucket of byKey.values()) {
    if (bucket.length < 2) continue;

    // Best survivor first, so the row every other row is measured against is
    // also the one that keeps its id.
    const ordered = [...bucket].sort(compareSurvivor);
    const open: Cluster[] = [];

    for (const row of ordered) {
      // A stop without coordinates cannot be shown to be the same place as
      // another. Left alone rather than guessed at.
      //
      // The null check is separate because Number(null) is 0, which is finite
      // and sits in the Gulf of Guinea — every uncoordinated stop would have
      // clustered with every other one.
      if (row.latitude === null || row.longitude === null) continue;
      const lat = Number(row.latitude);
      const lon = Number(row.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      const home = open.find(cluster => {
        const s = cluster.survivor;
        if (s.state && row.state && s.state !== row.state) return false;
        return (
          metresBetween(Number(s.latitude), Number(s.longitude), lat, lon) <= radius
        );
      });

      if (home) home.absorbed.push(row);
      else open.push({ survivor: row, absorbed: [] });
    }

    clusters.push(...open.filter(cluster => cluster.absorbed.length > 0));
  }

  return clusters;
}

/**
 * Which row keeps its id.
 *
 * The busiest stop wins: it is the one already linked from the most trips, so
 * choosing it moves the fewest rows and keeps whatever external references
 * exist pointing somewhere still meaningful. Ties go to the row that names its
 * state, then to the lowest id so the result is stable between runs.
 */
function compareSurvivor(a: StopRow, b: StopRow): number {
  if (a.serviceCount !== b.serviceCount) return b.serviceCount - a.serviceCount;
  const aState = a.state ? 1 : 0;
  const bState = b.state ? 1 : 0;
  if (aState !== bState) return bState - aState;
  return a.id.localeCompare(b.id);
}

async function main(): Promise<void> {
  const sequelize = new Sequelize({
    dialect: 'postgres',
    logging: false,
    ...postgresConnection(processEnvLookup),
  } as never);
  await sequelize.authenticate();

  // Only names that occur more than once are worth loading; the rest cannot
  // duplicate anything by definition.
  const rows = await sequelize.query<StopRow>(
    `WITH keyed AS (
       SELECT s.id, s.name, s.latitude, s.longitude, s.state, s.provider,
              regexp_replace(lower(s.name), '[^a-z0-9]', '', 'g') AS key
       FROM stops s
       WHERE s.latitude IS NOT NULL AND s.longitude IS NOT NULL
     ),
     repeated AS (
       SELECT key FROM keyed WHERE key <> '' GROUP BY key HAVING count(*) > 1
     )
     SELECT k.id, k.name, k.latitude, k.longitude, k.state, k.provider,
            (SELECT count(*)::int FROM stop_times st WHERE st."stopId" = k.id)
              AS "serviceCount"
     FROM keyed k
     JOIN repeated r ON r.key = k.key`,
    { type: QueryTypes.SELECT },
  );

  const clusters = clusterStops(rows);
  const absorbedIds = clusters.flatMap(c => c.absorbed.map(s => s.id));

  console.log(`Stops sharing a name with another : ${rows.length}`);
  console.log(`Clusters to merge                : ${clusters.length}`);
  console.log(`Rows to be absorbed              : ${absorbedIds.length}\n`);

  for (const cluster of clusters.slice(0, 20)) {
    const names = cluster.absorbed.map(s => `"${s.name}"`).join(', ');
    console.log(
      `  "${cluster.survivor.name}" (${cluster.survivor.serviceCount} services)` +
        ` <- ${cluster.absorbed.length}: ${names}`,
    );
  }
  if (clusters.length > 20) console.log(`  ... and ${clusters.length - 20} more`);

  if (!absorbedIds.length) {
    await sequelize.close();
    return;
  }

  // The journal is written on a dry run too: it is the thing worth reading
  // before deciding whether to apply.
  const journalPath = resolve(__dirname, `../../merge-duplicate-stops.json`);
  writeFileSync(
    journalPath,
    JSON.stringify(
      clusters.map(cluster => ({
        survivorId: cluster.survivor.id,
        survivorName: cluster.survivor.name,
        absorbed: cluster.absorbed.map(s => ({ id: s.id, name: s.name })),
      })),
      null,
      2,
    ),
  );
  console.log(`\nJournal written to ${journalPath}`);

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to write these merges.');
    await sequelize.close();
    return;
  }

  // One transaction: a half-repointed stop is worse than either state, since
  // its services would be split across a row that no longer exists.
  //
  // Set-based, not a loop over clusters. The first version issued four UPDATEs
  // per cluster — nearly 16,000 round trips — and was still running after ten
  // minutes before the process died and rolled the whole thing back. The
  // mapping goes into a temp table once and each target table is rewritten in
  // a single pass.
  const transaction = await sequelize.transaction();

  try {
    await sequelize.query(
      `CREATE TEMP TABLE stop_merge_map (
         "fromId" uuid PRIMARY KEY,
         "toId"   uuid NOT NULL
       ) ON COMMIT DROP`,
      { transaction },
    );

    // Bind, not replacements: replacements interpolate a JS array as a quoted
    // comma list, which unnest() cannot read. Bound parameters reach Postgres
    // as real arrays.
    await sequelize.query(
      `INSERT INTO stop_merge_map ("fromId", "toId")
       SELECT * FROM unnest($1::uuid[], $2::uuid[])`,
      {
        transaction,
        bind: [
          clusters.flatMap(c => c.absorbed.map(stop => stop.id)),
          clusters.flatMap(c => c.absorbed.map(() => c.survivor.id)),
        ],
      },
    );

    const repoint = async (table: string, column: string) => {
      const [, affected] = await sequelize.query(
        `UPDATE "${table}" t SET "${column}" = m."toId"
         FROM stop_merge_map m WHERE t."${column}" = m."fromId"`,
        { transaction },
      );
      return Number((affected as { rowCount?: number })?.rowCount ?? 0);
    };

    const moved = {
      stopTimes: await repoint('stop_times', 'stopId'),
      origins: await repoint('routes', 'originStopId'),
      destinations: await repoint('routes', 'destinationStopId'),
      busRouteStops: await repoint('bus_route_stops', 'stopId'),
      busStopTimes: await repoint('bus_stop_times', 'stopId'),
    };

    // Repointing can land two rows on the same (trip, stop, sequence) — the
    // same service listed once per import. Keep the one that carries a time.
    const collapsibleSql = `SELECT id FROM (
        SELECT id, row_number() OVER (
          PARTITION BY "tripId", "stopId", "stopSequence"
          ORDER BY ("departureTime" IS NULL), ("arrivalTime" IS NULL), id
        ) AS rank
        FROM stop_times
      ) ranked WHERE rank > 1`;

    // Counted before deleting: a merge that silently drops timetable rows is
    // exactly the thing worth being able to see afterwards.
    const collapsible = await sequelize.query<{ id: string }>(collapsibleSql, {
      transaction,
      type: QueryTypes.SELECT,
    });

    if (collapsible.length) {
      await sequelize.query(`DELETE FROM stop_times WHERE id IN (${collapsibleSql})`, {
        transaction,
      });
    }

    // The raw provider rows in bus_stops are left in place: they are the
    // import's own record of what the operator published, and deleting them
    // would make the next ingestion look like a first import.
    await sequelize.query(
      `DELETE FROM stops WHERE id IN (SELECT "fromId" FROM stop_merge_map)`,
      { transaction },
    );

    await transaction.commit();

    console.log('\nApplied:');
    console.log(`  stop_times repointed      : ${moved.stopTimes}`);
    console.log(`  route origins repointed   : ${moved.origins}`);
    console.log(`  route ends repointed      : ${moved.destinations}`);
    console.log(`  bus_route_stops repointed : ${moved.busRouteStops}`);
    console.log(`  bus_stop_times repointed  : ${moved.busStopTimes}`);
    console.log(`  duplicate stop_times gone : ${collapsible.length}`);
    console.log(`  stop rows removed         : ${absorbedIds.length}`);
  } catch (error) {
    await transaction.rollback();
    console.error('\nRolled back. Nothing was changed.');
    throw error;
  } finally {
    await sequelize.close();
  }
}

// Only when run as a script. The spec imports the clustering functions, and
// importing this file must not open a database connection.
if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
