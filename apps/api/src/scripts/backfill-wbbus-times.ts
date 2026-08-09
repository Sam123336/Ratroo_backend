/**
 * Fill in departure times for WBBUS routes that have a stop list but no clock.
 *
 *   npm run wbbus:backfill-times -- --dry --limit 5
 *   npm run wbbus:backfill-times -- --limit 50
 *   npm run wbbus:backfill-times
 *
 * 1,352 WBBUS routes carry a full stop sequence with every departureTime null,
 * so Route Details showed a column of dashes. The times are not missing from
 * the source: each `/bus/<slug>` page publishes an Up Time and Down Time per
 * stoppage. They were simply never captured for these routes.
 *
 * The route's externalId is the page slug — "aniket-wb41g0280-barakar-
 * arambagh-81:up" is https://wbbus.in/bus/aniket-wb41g0280-barakar-arambagh-81
 * in the "up" direction. 714 routes resolve this way; the rest were ingested
 * by another path and carry only a UUID, so they are skipped rather than
 * guessed at.
 *
 * Times are matched to stops BY NAME, not by position: a page listing a stop
 * the graph does not have would otherwise shift every later time by one and
 * silently corrupt the whole route.
 *
 * One request per second with an identifying User-Agent. wbbus.in is a small
 * community site and this walks its whole catalogue.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import * as cheerio from 'cheerio';
import { QueryTypes, Sequelize } from 'sequelize';
import { postgresConnection, processEnvLookup } from '../database/connection-options';

config({ path: resolve(__dirname, '../../../../.env') });

const DRY_RUN = process.argv.includes('--dry');
const limitIndex = process.argv.indexOf('--limit');
const LIMIT = limitIndex === -1 ? Infinity : Number(process.argv[limitIndex + 1]);

// 1.1s got the crawl throttled partway through a 700-page run: 550 requests
// failed in a burst that the site served fine again once paused. Slower is
// cheaper than a second full pass.
const REQUEST_DELAY_MS = 1600;
const USER_AGENT = 'RatrooBot/1.0 (West Bengal transit app; ankit@trustlenz.com)';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface UntimedRoute {
  routeId: string;
  tripId: string;
  externalId: string;
  longName: string | null;
}

/** "5:30 AM" / "10:45 PM" -> "HH:MM". Null for anything unparseable. */
export function toHHMM(raw: string | undefined | null): string | null {
  if (!raw) return null;

  const match = /^(\d{1,2}):(\d{2})\s*([AP])M$/i.exec(raw.trim());
  if (!match) return null;

  const minutes = Number(match[2]);
  let hours = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'P') hours += 12;
  if (minutes > 59) return null;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/** One stoppage row from a `/bus/<slug>` page. */
export interface ScrapedStop {
  name: string;
  up: string | null;
  down: string | null;
}

/**
 * Reads the "# | Up Time | Stoppage Name | Down Time" table.
 *
 * The blank cells are real: many stoppages are timed in one direction only.
 */
export function parseStoppages(html: string): ScrapedStop[] {
  const $ = cheerio.load(html);
  const stops: ScrapedStop[] = [];

  $('div.row.sud').each((_, row) => {
    const cells = $(row).find('div[class*="col-"]');
    if (cells.length < 4) return;

    const name = $(cells[2]).text().trim();
    if (!name) return;

    stops.push({
      name,
      up: toHHMM($(cells[1]).text()),
      down: toHHMM($(cells[3]).text()),
    });
  });

  return stops;
}

/**
 * Pages are cached by slug: a bus appears as two routes (up and down) that
 * share one page, so fetching per route doubled the crawl for no new data.
 */
const pageCache = new Map<string, string | null>();

async function fetchPage(slug: string): Promise<string | null> {
  if (pageCache.has(slug)) return pageCache.get(slug)!;

  let html: string | null = null;
  try {
    // Without a deadline a stalled connection hangs the whole crawl — the
    // first run managed 50 pages in twelve minutes because of it.
    const response = await fetch(`https://wbbus.in/bus/${slug}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });
    if (response.ok) html = await response.text();
  } catch {
    html = null;
  }

  pageCache.set(slug, html);
  return html;
}

async function main() {
  const sequelize = new Sequelize({
    dialect: 'postgres', logging: false, ...postgresConnection(processEnvLookup),
  } as never);
  await sequelize.authenticate();

  // Only routes that have stops to attach times to, and a slug we can resolve.
  const routes = await sequelize.query<UntimedRoute>(
    `SELECT r.id AS "routeId", t.id AS "tripId", r."externalId", r."longName"
     FROM routes r
     JOIN trips t ON t."routeId" = r.id
     WHERE r.provider = 'WBBUS'
       AND r."externalId" ~ '^[a-z0-9].*-[0-9]+(:up|:down)?$'
       AND EXISTS (SELECT 1 FROM stop_times st WHERE st."tripId" = t.id)
       AND NOT EXISTS (
         SELECT 1 FROM stop_times st
         WHERE st."tripId" = t.id AND st."departureTime" IS NOT NULL
       )
     ORDER BY r."externalId"`,
    { type: QueryTypes.SELECT },
  );

  console.log(`${routes.length} untimed WBBUS trips with a resolvable source page.\n`);

  let pagesFetched = 0;
  let routesFilled = 0;
  let timesWritten = 0;
  let noTimesOnPage = 0;
  let unreachable = 0;

  for (const route of routes.slice(0, LIMIT === Infinity ? undefined : LIMIT)) {
    const [slug, suffix] = route.externalId.split(':');
    // The externalId records which working this route row represents.
    const direction: 'up' | 'down' = suffix === 'down' ? 'down' : 'up';

    // Only pause for a request we are actually about to make.
    if (!pageCache.has(slug)) {
      await delay(REQUEST_DELAY_MS);
      pagesFetched++;
    }
    const html = await fetchPage(slug);

    if (!html) {
      unreachable++;
      continue;
    }

    const scraped = parseStoppages(html);
    const byName = new Map<string, ScrapedStop>();
    for (const stop of scraped) byName.set(stop.name.toLowerCase(), stop);

    if (!scraped.some(stop => stop[direction])) {
      noTimesOnPage++;
      continue;
    }

    const stopTimes = await sequelize.query<{ id: string; name: string }>(
      `SELECT st.id, s.name
       FROM stop_times st JOIN stops s ON s.id = st."stopId"
       WHERE st."tripId" = :tripId
       ORDER BY st."stopSequence"`,
      { replacements: { tripId: route.tripId }, type: QueryTypes.SELECT },
    );

    let written = 0;
    for (const stopTime of stopTimes) {
      const time = byName.get(stopTime.name.toLowerCase())?.[direction];
      if (!time) continue; // Untimed at this stoppage, in this direction.

      if (!DRY_RUN) {
        await sequelize.query(
          `UPDATE stop_times
           SET "departureTime" = :time, "arrivalTime" = :time, "timeSource" = 'SCRAPED'
           WHERE id = :id`,
          { replacements: { id: stopTime.id, time }, type: QueryTypes.UPDATE },
        );
      }
      written++;
    }

    if (written) {
      routesFilled++;
      timesWritten += written;
      console.log(`  ${route.longName ?? slug}: ${written}/${stopTimes.length} stops timed`);
    }
  }

  console.log(`\n${DRY_RUN ? 'Would write' : 'Wrote'}:`);
  console.log(`  pages fetched              : ${pagesFetched}`);
  console.log(`  routes given times         : ${routesFilled}`);
  console.log(`  stop times written         : ${timesWritten}`);
  console.log(`  pages with no times listed : ${noTimesOnPage}`);
  console.log(`  pages unreachable          : ${unreachable}`);

  await sequelize.close();
}

if (process.argv.includes('--selftest')) {
  // The two formats the page mixes, plus the shapes that must not slip through.
  const cases: Array<[string | null, string | null]> = [
    ['5:30 AM', '05:30'], ['12:05 AM', '00:05'], ['12:05 PM', '12:05'],
    ['4:10 PM', '16:10'], ['11:59 PM', '23:59'],
    ['', null], [null, null], ['5:70 AM', null], ['soon', null],
  ];
  for (const [input, expected] of cases) {
    if (toHHMM(input) !== expected) {
      throw new Error(`toHHMM(${JSON.stringify(input)}) = ${toHHMM(input)}, want ${expected}`);
    }
  }
  console.log(`toHHMM: ${cases.length} cases pass.`);
} else {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
