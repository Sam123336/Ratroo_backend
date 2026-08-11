/**
 * Record every operator's wording for a place as an alias of it.
 *
 *   npm run places:seed-aliases            # dry run: prints the plan
 *   npm run places:seed-aliases -- --apply # writes
 *
 * Providers name the same stand differently — "Asansol", "Asansol Bus
 * Terminus", "ARAMBAG (NS)", "Durgapur (Muchipara)" — and canonical resolution
 * has already tied their stops to one place (1,707 of 1,710 West Bengal stops
 * are linked). But `places` keeps only one of those titles, so searching for
 * any of the others found nothing. The app was printing "Durgapur
 * (Muchipara)" in a journey leg and then failing to resolve the same string
 * when a rider typed it back.
 *
 * Nothing is inferred. Every alias is a name some operator actually publishes
 * for a stop that is already linked to the place; this only makes that linkage
 * searchable by name instead of by id.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { QueryTypes, Sequelize } from 'sequelize';
import { postgresConnection, processEnvLookup } from '../database/connection-options';

config({ path: resolve(__dirname, '../../../../.env') });

const APPLY = process.argv.includes('--apply');

/**
 * These aliases are only as good as the stop-to-place linkage they come from,
 * which is fuzzy-matched. Kept below the 1.0 of hand-confirmed aliases so a
 * later pass can tell the two apart.
 */
const CONFIDENCE = 0.9;

/**
 * Candidate aliases: a linked stop's name that the place is not already
 * findable by.
 *
 * Excludes the place's own canonical and normalised names — those already
 * resolve — and anything already recorded, so re-running adds nothing.
 */
const CANDIDATES = `
  SELECT DISTINCT
    bs."placeId",
    bs."providerCode",
    bs.name AS alias,
    lower(trim(bs.name)) AS "normalizedAlias"
  FROM bus_stops bs
  JOIN places p ON p.id = bs."placeId"
  WHERE bs."placeId" IS NOT NULL
    AND trim(bs.name) <> ''
    AND lower(trim(bs.name)) <> lower(p."canonicalName")
    AND lower(trim(bs.name)) IS DISTINCT FROM lower(p."normalizedName")
    AND NOT EXISTS (
      SELECT 1 FROM place_aliases a
      WHERE a."placeId" = bs."placeId"
        AND a."normalizedAlias" = lower(trim(bs.name))
    )
`;

async function main(): Promise<void> {
  const sequelize = new Sequelize({
    dialect: 'postgres',
    logging: false,
    ...postgresConnection(processEnvLookup),
  } as never);
  await sequelize.authenticate();

  const candidates = await sequelize.query<{
    placeId: string;
    providerCode: string;
    alias: string;
    normalizedAlias: string;
  }>(CANDIDATES, { type: QueryTypes.SELECT });

  console.log(`Aliases to add: ${candidates.length}`);
  for (const row of candidates.slice(0, 15)) {
    console.log(`  "${row.alias}" (${row.providerCode})`);
  }
  if (candidates.length > 15) console.log(`  ... and ${candidates.length - 15} more`);

  // A name that resolves to two different places is worth seeing before it is
  // written: it means one of the two linkages is wrong, and searching for it
  // will now return whichever the ranking prefers.
  const ambiguous = await sequelize.query<{ normalizedAlias: string; places: number }>(
    `SELECT "normalizedAlias", count(DISTINCT "placeId")::int AS places
     FROM (${CANDIDATES}) c
     GROUP BY "normalizedAlias" HAVING count(DISTINCT "placeId") > 1
     ORDER BY places DESC LIMIT 10`,
    { type: QueryTypes.SELECT },
  );

  if (ambiguous.length) {
    console.log(`\nNames that would point at more than one place:`);
    for (const row of ambiguous) {
      console.log(`  "${row.normalizedAlias}" -> ${row.places} places`);
    }
    console.log('  (kept: each is a real operator name; the ranking picks one)');
  }

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to write these aliases.');
    await sequelize.close();
    return;
  }

  const [, inserted] = await sequelize.query(
    `INSERT INTO place_aliases
       (id, "placeId", "providerCode", alias, "normalizedAlias", confidence, "createdAt", "updatedAt")
     SELECT gen_random_uuid(), c."placeId", c."providerCode", c.alias, c."normalizedAlias",
            :confidence, now(), now()
     FROM (${CANDIDATES}) c`,
    { replacements: { confidence: CONFIDENCE } },
  );

  console.log(`\nApplied: ${Number(inserted ?? candidates.length)} aliases written.`);
  await sequelize.close();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
