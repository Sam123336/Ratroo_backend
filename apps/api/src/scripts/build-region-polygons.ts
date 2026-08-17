/**
 * Build one coverage polygon per state from the stops we actually hold.
 *
 *   npm run regions:build-polygons
 *   npm run regions:build-polygons -- --dry
 *
 * The polygon answers "which of Ratroo's regions is this rider standing in".
 * It is deliberately *our coverage*, not a state border: a political boundary
 * is a sourced geographic fact and we have no licensed dataset for one, so
 * claiming one would be inventing data. What this can honestly say is where our
 * stops are, and that is the question the home screen actually asks.
 *
 * Swapping in real administrative boundaries later means replacing the SQL
 * below and nothing else — readers only ever do ST_Contains against `boundary`.
 *
 * Method, all of it native PostGIS:
 *
 *  1. ST_ClusterDBSCAN groups each state's stops. Clusters below `minpoints`
 *     are returned as NULL — noise — and dropped. That is what keeps two
 *     mis-geocoded KOLKATA_TRAM stops sitting in Bengaluru from stretching the
 *     West Bengal polygon 1,500 km across the country.
 *  2. A concave hull per surviving cluster, unioned into one MultiPolygon, so
 *     genuinely disjoint coverage (Darjeeling and Kolkata) stays disjoint
 *     instead of being bridged by a convex hull.
 *  3. A small buffer outward, because stops sit on roads and a rider is
 *     normally beside one rather than on it.
 */
import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';
import { AppModule } from '../app.module';

config();

/** ~55 km. Two stops further apart than this start separate clusters. */
const CLUSTER_EPS_DEGREES = Number(process.env.REGION_CLUSTER_EPS ?? 0.5);

/**
 * A cluster needs this many stops to count as coverage.
 *
 * At 5, the two stray Bengaluru tram stops are noise and vanish. Raising it
 * discards small genuine pockets; lowering it lets a mis-geocoded pair become
 * a region.
 */
const CLUSTER_MIN_POINTS = Number(process.env.REGION_CLUSTER_MIN_POINTS ?? 5);

/** ~11 km of tolerance around the hull. */
const BUFFER_DEGREES = Number(process.env.REGION_BUFFER_DEGREES ?? 0.1);

/** 0 = convex, 1 = maximally concave. 0.3 tracks the shape without spikes. */
const CONCAVITY = Number(process.env.REGION_CONCAVITY ?? 0.3);

const STATE_NAMES: Record<string, string> = {
  KA: 'Karnataka',
  WB: 'West Bengal',
};

interface BuiltRow {
  stateCode: string;
  stopCount: number;
  clusters: number;
  noise: number;
  areaKm2: number;
}

async function main() {
  const dryRun = process.argv.includes('--dry');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const sequelize = app.get(Sequelize);

  try {
    await sequelize.transaction(async transaction => {
      // Clustering and hulling ~8k points is well past the managed role's
      // 2-minute statement_timeout on a cold cache.
      await sequelize.query(`SET LOCAL statement_timeout = 600000`, { transaction });

      const built = await sequelize.query<BuiltRow>(
        `WITH located AS (
           SELECT state AS "stateCode",
                  ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) AS geom
           FROM stops
           WHERE state IS NOT NULL
             AND latitude IS NOT NULL AND longitude IS NOT NULL
             -- 0,0 is a real place in the Gulf of Guinea; an unsurveyed stop
             -- left there would drag every hull to the equator.
             AND NOT (latitude = 0 AND longitude = 0)
         ),
         clustered AS (
           SELECT "stateCode", geom,
                  ST_ClusterDBSCAN(geom, eps := :eps, minpoints := :minPoints)
                    OVER (PARTITION BY "stateCode") AS cluster_id
           FROM located
         ),
         hulls AS (
           SELECT "stateCode", cluster_id,
                  ST_ConcaveHull(ST_Collect(geom), :concavity) AS hull,
                  count(*)::int AS stops
           FROM clustered
           WHERE cluster_id IS NOT NULL
           GROUP BY "stateCode", cluster_id
         ),
         merged AS (
           SELECT "stateCode",
                  ST_Multi(
                    ST_Buffer(ST_Union(hull), :buffer)
                  ) AS boundary,
                  sum(stops)::int AS "stopCount",
                  count(*)::int AS clusters
           FROM hulls
           GROUP BY "stateCode"
         ),
         noise AS (
           SELECT "stateCode", count(*)::int AS dropped
           FROM clustered WHERE cluster_id IS NULL GROUP BY "stateCode"
         )
         INSERT INTO coverage_areas
           (id, "countryCode", "stateCode", "stateName", "areaType", name, slug,
            boundary, "stopCount", "boundaryBuiltAt", metadata, "createdAt", "updatedAt")
         SELECT gen_random_uuid(), 'IN', m."stateCode",
                coalesce(:names::jsonb ->> m."stateCode", m."stateCode"),
                'STATE',
                coalesce(:names::jsonb ->> m."stateCode", m."stateCode") || ' coverage',
                lower(m."stateCode") || '-coverage',
                m.boundary, m."stopCount", now(),
                jsonb_build_object(
                  'source', 'derived from Ratroo stop coverage, not an administrative boundary',
                  'method', 'ST_ClusterDBSCAN + ST_ConcaveHull + ST_Buffer',
                  'eps', :eps, 'minPoints', :minPoints,
                  'concavity', :concavity, 'bufferDegrees', :buffer,
                  'clusters', m.clusters,
                  'stopsDroppedAsNoise', coalesce(n.dropped, 0)
                ),
                now(), now()
         FROM merged m LEFT JOIN noise n ON n."stateCode" = m."stateCode"
         ON CONFLICT ("countryCode", "stateCode", "areaType", coalesce("cityName", ''))
         DO UPDATE SET boundary = EXCLUDED.boundary,
                       "stopCount" = EXCLUDED."stopCount",
                       "boundaryBuiltAt" = EXCLUDED."boundaryBuiltAt",
                       metadata = EXCLUDED.metadata,
                       "updatedAt" = now()
         RETURNING "stateCode",
                   "stopCount",
                   (metadata ->> 'clusters')::int AS clusters,
                   (metadata ->> 'stopsDroppedAsNoise')::int AS noise,
                   round((ST_Area(boundary::geography) / 1000000)::numeric)::int AS "areaKm2"`,
        {
          replacements: {
            eps: CLUSTER_EPS_DEGREES,
            minPoints: CLUSTER_MIN_POINTS,
            concavity: CONCAVITY,
            buffer: BUFFER_DEGREES,
            names: JSON.stringify(STATE_NAMES),
          },
          type: QueryTypes.SELECT,
          transaction,
        },
      );

      console.log('');
      console.log('state  stops  clusters  dropped as noise  area km²');
      for (const row of built) {
        console.log(
          `${row.stateCode.padEnd(6)} ${String(row.stopCount).padEnd(6)} ` +
            `${String(row.clusters).padEnd(9)} ${String(row.noise).padEnd(17)} ${row.areaKm2}`,
        );
      }
      console.log('');

      // Every state must land in exactly one polygon, or the resolver has to
      // pick a winner and the answer stops being deterministic.
      const [overlap] = await sequelize.query<{ pairs: number }>(
        `SELECT count(*)::int AS pairs
           FROM coverage_areas a JOIN coverage_areas b
             ON a.id < b.id AND a."areaType" = 'STATE' AND b."areaType" = 'STATE'
            AND ST_Intersects(a.boundary, b.boundary)`,
        { type: QueryTypes.SELECT, transaction },
      );
      if (overlap.pairs) {
        console.log(
          `WARNING: ${overlap.pairs} overlapping state polygon pair(s). A point in the ` +
            'overlap resolves to whichever row the resolver reads first. Lower ' +
            'REGION_BUFFER_DEGREES, or fix the mislabelled stops feeding the hulls.',
        );
      }

      if (dryRun) {
        console.log('Rolled back — nothing was written. Re-run without --dry to apply.');
        throw new RollbackSignal();
      }
    });
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error;
  } finally {
    await app.close();
  }
}

/** Rolls the transaction back without reporting a failure to the caller. */
class RollbackSignal extends Error {}

main().catch(error => {
  console.error(error?.message ?? error);
  process.exit(1);
});
