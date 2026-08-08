/**
 * Geocode stops whose coordinates are missing or provably wrong.
 *
 *   npm run stops:repair -- --dry            # report what it would change
 *   npm run stops:repair -- --limit 50       # geocode 50, then stop
 *   npm run stops:repair                     # all candidates (slow: 1 req/sec)
 *
 * Nominatim's usage policy is one request per second with an identifying User
 * Agent. That is respected here — it is the price of a free geocoder, and
 * exceeding it gets the whole project blocked.
 *
 * Candidates, in priority order:
 *   1. no coordinates at all
 *   2. coordinates outside West Bengal for a West Bengal operator
 *   3. coordinates shared with other stops (the fabricated-point clusters)
 *
 * BMTC stops are excluded: Bengaluru is legitimately outside West Bengal.
 *
 * A result is only written when it lands inside West Bengal. A geocoder that
 * confidently returns Bengal, Ohio must not be allowed to make things worse
 * than the null it replaced.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { QueryTypes, Sequelize } from 'sequelize';
import { postgresConnection, processEnvLookup } from '../database/connection-options';

config({ path: resolve(__dirname, '../../../../.env') });

const DRY_RUN = process.argv.includes('--dry');
const limitIndex = process.argv.indexOf('--limit');
const LIMIT = limitIndex === -1 ? Infinity : Number(process.argv[limitIndex + 1]);

/** Nominatim: 1 request/second, identifying UA. Non-negotiable. */
const REQUEST_DELAY_MS = 1100;
const USER_AGENT = 'RatrooBot/1.0 (West Bengal transit app; ankit@trustlenz.com)';

/** Generous West Bengal bounding box. */
const WB = { minLat: 21.4, maxLat: 27.3, minLng: 85.8, maxLng: 89.9 };

const inWestBengal = (lat: number, lng: number) =>
  lat >= WB.minLat && lat <= WB.maxLat && lng >= WB.minLng && lng <= WB.maxLng;

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

interface Candidate { id: string; name: string; reason: string }

async function geocode(name: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
    q: `${name}, West Bengal, India`,
    format: 'json',
    limit: '1',
    countrycodes: 'in',
  });

  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return null;

    const [hit] = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    if (!hit) return null;

    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return { lat, lng, label: hit.display_name };
  } catch {
    return null;
  }
}

async function main() {
  const sequelize = new Sequelize({
    dialect: 'postgres', logging: false, ...postgresConnection(processEnvLookup),
  } as never);

  const candidates = await sequelize.query<Candidate>(
    `SELECT id, name,
            CASE
              WHEN latitude IS NULL THEN 'missing'
              WHEN latitude NOT BETWEEN :minLat AND :maxLat
                OR longitude NOT BETWEEN :minLng AND :maxLng THEN 'outside-wb'
              ELSE 'shared-point'
            END AS reason
     FROM stops
     WHERE provider <> 'BMTC_OFFICIAL'
       AND (
         latitude IS NULL
         OR latitude NOT BETWEEN :minLat AND :maxLat
         OR longitude NOT BETWEEN :minLng AND :maxLng
         OR (latitude, longitude) IN (
           SELECT latitude, longitude FROM stops
           WHERE latitude IS NOT NULL GROUP BY 1, 2 HAVING count(*) > 1
         )
       )
     ORDER BY 3, name`,
    { replacements: { ...WB }, type: QueryTypes.SELECT },
  );

  const byReason = candidates.reduce<Record<string, number>>((acc, c) => {
    acc[c.reason] = (acc[c.reason] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`candidates: ${candidates.length}`, JSON.stringify(byReason));

  if (DRY_RUN) {
    console.log('\nfirst 15:');
    candidates.slice(0, 15).forEach(c => console.log(`   ${c.reason.padEnd(13)} ${c.name}`));
    const minutes = Math.ceil((candidates.length * REQUEST_DELAY_MS) / 60000);
    console.log(`\n--dry: nothing written. A full run takes about ${minutes} minute(s) at 1 req/sec.`);
    await sequelize.close();
    return;
  }

  const work = candidates.slice(0, LIMIT === Infinity ? candidates.length : LIMIT);
  let fixed = 0;
  let rejected = 0;
  let notFound = 0;

  for (const [index, stop] of work.entries()) {
    const hit = await geocode(stop.name);
    await delay(REQUEST_DELAY_MS);

    if (!hit) {
      notFound++;
      continue;
    }

    // Better to keep a null than to write a confident wrong answer.
    if (!inWestBengal(hit.lat, hit.lng)) {
      rejected++;
      continue;
    }

    await sequelize.query(
      `UPDATE stops
       SET latitude = :lat, longitude = :lng,
           location = ST_SetSRID(ST_MakePoint(:lng, :lat), 4326),
           "updatedAt" = now()
       WHERE id = :id`,
      { replacements: { id: stop.id, lat: hit.lat, lng: hit.lng }, type: QueryTypes.UPDATE },
    );

    fixed++;
    if (fixed % 25 === 0 || index === work.length - 1) {
      console.log(`   ${index + 1}/${work.length}  fixed=${fixed} rejected=${rejected} notFound=${notFound}`);
    }
  }

  console.log(`\nfixed: ${fixed}   rejected (outside WB): ${rejected}   not found: ${notFound}`);
  console.log('These are canonical `stops` rows, so no projection re-run is needed.');

  await sequelize.close();
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
