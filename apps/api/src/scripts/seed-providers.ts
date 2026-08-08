/**
 * Populate the providers table so the app can link to an operator's own site.
 *
 *   npm run providers:seed -- --dry
 *   npm run providers:seed
 *
 * The table was empty, so "View official timetable on WBBUS" could only ever
 * answer "no URL recorded". The app reads `website` from here.
 *
 * Every URL below was fetched and confirmed to return that operator's own
 * page. Codes whose site could not be confirmed are deliberately absent rather
 * than filled with a plausible guess: a dead link presented as official is
 * worse than the honest "not recorded yet" the app already handles.
 *
 * Checked and excluded:
 *   SBSTC                     sbstc.co.in redirect-loops (301 to itself)
 *   WBBUSTIME                 wbbustime.com returns 403 to non-browser clients
 *   BUSSATHI                  bussathi.in does not resolve
 *   WB_FERRY, KOLKATA_TRAM,
 *   EASTERN_RAILWAY_SUBURBAN,
 *   BMTC_OFFICIAL             no confirmed official URL yet
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { QueryTypes, Sequelize } from 'sequelize';
import { postgresConnection, processEnvLookup } from '../database/connection-options';

config({ path: resolve(__dirname, '../../../../.env') });

const DRY_RUN = process.argv.includes('--dry');

interface ProviderSeed {
  code: string;
  name: string;
  sourceType: string;
  website: string;
  modes: string[];
}

/** Verified 2026-08-09: each URL returned a page identifying the operator. */
const PROVIDERS: ProviderSeed[] = [
  {
    code: 'WBTC',
    name: 'West Bengal Transport Corporation',
    sourceType: 'GOVERNMENT',
    website: 'https://wbtconline.in',
    modes: ['BUS'],
  },
  {
    code: 'NBSTC',
    name: 'North Bengal State Transport Corporation',
    sourceType: 'GOVERNMENT',
    website: 'https://nbstc.co.in',
    modes: ['BUS'],
  },
  {
    code: 'WBBUS',
    name: 'WBBus.in Transport Directory',
    sourceType: 'COMMUNITY',
    website: 'https://wbbus.in',
    modes: ['BUS'],
  },
  {
    code: 'OPENSTREETMAP',
    name: 'OpenStreetMap',
    sourceType: 'OPEN_DATA',
    website: 'https://www.openstreetmap.org',
    modes: ['BUS', 'RAIL', 'FERRY'],
  },
];

async function main() {
  const sequelize = new Sequelize({
    dialect: 'postgres', logging: false, ...postgresConnection(processEnvLookup),
  } as never);
  await sequelize.authenticate();

  for (const provider of PROVIDERS) {
    if (DRY_RUN) {
      console.log(`  would upsert ${provider.code} -> ${provider.website}`);
      continue;
    }

    await sequelize.query(
      `INSERT INTO providers (id, code, name, "sourceType", website, version, "transportModes", "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), :code, :name, :sourceType, :website, 'v1', ARRAY[:modes]::varchar[], now(), now())
       ON CONFLICT (code) DO UPDATE
         SET name = EXCLUDED.name,
             website = EXCLUDED.website,
             "updatedAt" = now()`,
      { replacements: { ...provider }, type: QueryTypes.INSERT },
    );
    console.log(`  ${provider.code} -> ${provider.website}`);
  }

  const [{ count }] = await sequelize.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM providers`,
    { type: QueryTypes.SELECT },
  );
  console.log(`\nproviders table now holds ${count} row(s).`);

  await sequelize.close();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
