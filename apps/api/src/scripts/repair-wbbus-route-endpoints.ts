/**
 * Recover the real origin and destination for WBBUS routes that point at a
 * placeholder stop literally named "Destination".
 *
 *   npm run routes:repair-endpoints -- --dry     # report what it would change
 *   npm run routes:repair-endpoints              # apply
 *
 * The WBBUS scraper failed to split the detail page's operator/origin/
 * destination blob, so it invented ten stops all named "Destination", all
 * sharing the coordinates 22.58, 88.36, and pointed 613 routes at them. The app
 * rendered that faithfully as "Destination to Destination".
 *
 * The information was never lost — it is still in routes.longName, in one of
 * two shapes:
 *
 *   "JINIA\n  Bankura (Durgapur (Station)\n  2:05 PM-3:25 PM)"   -> both ends
 *   "ABIR SUPER\n  Reg No : WB05C4556\n  Taldangra\n"            -> origin only
 *
 * The second shape has no destination on the page. Those routes get their
 * origin restored and destinationStopId set to NULL: "not published" is the
 * true answer, and the column is nullable precisely for it.
 *
 * Every recovered name is matched against existing stops. This script never
 * creates a stop and never writes a coordinate — inventing either is what
 * produced the mess it is cleaning up.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { QueryTypes, Sequelize } from 'sequelize';
import { postgresConnection, processEnvLookup } from '../database/connection-options';

config({ path: resolve(__dirname, '../../../../.env') });

const DRY_RUN = process.argv.includes('--dry');

/** "OPERATOR \n ... ORIGIN (DESTINATION \n TIME-TIME)" */
const PAIR = /^\s*([^\n]+?)\s*\n[\s\S]*?([^\n(]+?)\s*\(\s*([^\n]+?)\s*\n\s*([^)]*?)\s*\)\s*$/;
/** "OPERATOR \n Reg No : X \n ORIGIN \n" — no destination on the page. */
const SINGLE = /^\s*([^\n]+?)\s*\n[\s\S]*?\n\s*([^\n:()]+?)\s*\n?\s*$/;

const normalise = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

interface AffectedRoute {
  id: string;
  longName: string | null;
  shortName: string | null;
}

interface Recovered {
  operator: string;
  origin: string;
  destination: string | null;
}

/** Pulls operator/origin/destination back out of the scraped blob. */
export function recoverEndpoints(longName: string | null): Recovered | null {
  if (!longName) return null;

  const pair = PAIR.exec(longName);
  if (pair) {
    return {
      operator: pair[1].trim(),
      origin: pair[2].trim(),
      destination: pair[3].trim(),
    };
  }

  const single = SINGLE.exec(longName);
  if (single) {
    return { operator: single[1].trim(), origin: single[2].trim(), destination: null };
  }

  return null;
}

async function main() {
  const sequelize = new Sequelize({
    dialect: 'postgres', logging: false, ...postgresConnection(processEnvLookup),
  } as never);
  await sequelize.authenticate();

  const routes = await sequelize.query<AffectedRoute>(
    `SELECT r.id, r."longName", r."shortName"
     FROM routes r
     LEFT JOIN stops origin ON origin.id = r."originStopId"
     LEFT JOIN stops destination ON destination.id = r."destinationStopId"
     WHERE origin.name = 'Destination' OR destination.name = 'Destination'`,
    { type: QueryTypes.SELECT },
  );

  const stops = await sequelize.query<{ id: string; name: string; normalizedName: string | null }>(
    `SELECT id, name, "normalizedName" FROM stops`,
    { type: QueryTypes.SELECT },
  );

  const stopByName = new Map<string, string>();
  for (const stop of stops) {
    stopByName.set(normalise(stop.normalizedName ?? stop.name), stop.id);
  }

  let bothEnds = 0;
  let originOnly = 0;
  let unparseable = 0;
  let unmatched = 0;

  for (const route of routes) {
    const recovered = recoverEndpoints(route.longName);
    if (!recovered) {
      unparseable++;
      console.log(`  ? unparseable ${route.shortName ?? route.id}`);
      continue;
    }

    const originId = stopByName.get(normalise(recovered.origin));
    const destinationId = recovered.destination
      ? stopByName.get(normalise(recovered.destination))
      : undefined;

    // A name we cannot match is left alone rather than guessed at.
    if (!originId) {
      unmatched++;
      console.log(`  ? no stop named "${recovered.origin}"`);
      continue;
    }

    if (recovered.destination && !destinationId) {
      unmatched++;
      console.log(`  ? no stop named "${recovered.destination}"`);
      continue;
    }

    // The operator is the one genuinely human label on the page. Kept as the
    // long name so the app stops rendering a wall of scraped whitespace.
    const longName = recovered.destination
      ? `${recovered.operator}: ${recovered.origin} to ${recovered.destination}`
      : `${recovered.operator}: from ${recovered.origin}`;

    if (!DRY_RUN) {
      await sequelize.query(
        `UPDATE routes
         SET "originStopId" = :originId,
             "destinationStopId" = :destinationId,
             "longName" = :longName,
             "updatedAt" = now()
         WHERE id = :id`,
        {
          replacements: {
            id: route.id,
            originId,
            destinationId: destinationId ?? null,
            longName,
          },
          type: QueryTypes.UPDATE,
        },
      );
    }

    if (destinationId) bothEnds++;
    else originOnly++;
  }

  // Whatever still points at a placeholder could not be parsed. Cutting the
  // reference loses nothing real — the target is a stop named "Destination"
  // sitting on invented coordinates — and it frees the row for deletion. The
  // operator text stays in longName, so the route is still identifiable.
  let referencesCut = 0;
  if (!DRY_RUN) {
    const [, meta] = await sequelize.query(
      `UPDATE routes SET
         "originStopId" = CASE WHEN "originStopId" IN (SELECT id FROM stops WHERE name = 'Destination')
                               THEN NULL ELSE "originStopId" END,
         "destinationStopId" = CASE WHEN "destinationStopId" IN (SELECT id FROM stops WHERE name = 'Destination')
                                    THEN NULL ELSE "destinationStopId" END,
         "updatedAt" = now()
       WHERE "originStopId" IN (SELECT id FROM stops WHERE name = 'Destination')
          OR "destinationStopId" IN (SELECT id FROM stops WHERE name = 'Destination')`,
    );
    referencesCut = (meta as { rowCount?: number })?.rowCount ?? 0;
  }

  // Only safe once nothing references them. Their coordinates were invented,
  // so leaving them behind would keep polluting nearby search.
  let placeholdersRemoved = 0;
  if (!DRY_RUN) {
    const [, meta] = await sequelize.query(
      `DELETE FROM stops
       WHERE name = 'Destination'
         AND id NOT IN (SELECT "originStopId" FROM routes WHERE "originStopId" IS NOT NULL)
         AND id NOT IN (SELECT "destinationStopId" FROM routes WHERE "destinationStopId" IS NOT NULL)
         AND id NOT IN (SELECT "stopId" FROM stop_times)`,
    );
    placeholdersRemoved = (meta as { rowCount?: number })?.rowCount ?? 0;
  }

  console.log('\n' + (DRY_RUN ? 'Would repair' : 'Repaired') + ':');
  console.log(`  origin + destination recovered : ${bothEnds}`);
  console.log(`  origin only (no destination published) : ${originOnly}`);
  console.log(`  left alone (unparseable) : ${unparseable}`);
  console.log(`  left alone (name matched no stop) : ${unmatched}`);
  console.log(`  placeholder references cut to NULL : ${referencesCut}`);
  console.log(`  placeholder "Destination" stops removed : ${placeholdersRemoved}`);

  await sequelize.close();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
