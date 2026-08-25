/**
 * Give metro stations coordinates, derived from bus stops of the same name.
 *
 *   npm run metro:locate-stations -- --dry    # report, write nothing
 *   npm run metro:locate-stations
 *   METRO_MATCH_SPREAD_KM=1.0 npm run metro:locate-stations
 *
 * A thin wrapper: the work lives in [MetroStationLocatorService], the same way
 * `promote-bmtc.ts` defers to `BmtcStaticImportService`. Keeping the logic in a
 * service means the nightly sync or an admin endpoint can call it without
 * shelling out, and it is testable without a database.
 */
import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { MetroStationLocatorService } from '../modules/provider-ingestion/application/MetroStationLocatorService';

config();

async function main() {
  const dryRun = process.argv.includes('--dry');
  const maxSpreadKm = Number(process.env.METRO_MATCH_SPREAD_KM ?? 0.5);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const result = await app.get(MetroStationLocatorService).locate({ dryRun, maxSpreadKm });

    console.log(`stations         ${result.stationsConsidered} unlocated (${result.alreadyLocated} already placed)`);
    console.log(`bus stops        ${result.stopsAvailable} with coordinates`);
    console.log('');
    console.log(`located          ${result.located.length}`);
    console.log(`ambiguous        ${result.ambiguous.length}   (same name, stops too far apart to choose)`);
    console.log(`unmatched        ${result.unmatched.length}   (no bus stop of that name)`);
    console.log('');

    for (const row of result.ambiguous.slice(0, 8)) {
      console.log(`  ambiguous: ${row.name} — ${row.candidates} stops ${row.spreadKm.toFixed(1)} km apart`);
    }
    if (result.unmatched.length) {
      console.log(`  unmatched: ${result.unmatched.slice(0, 12).join(', ')}`);
    }

    console.log('');
    if (dryRun) {
      console.log('Dry run — nothing written.');
      return;
    }
    console.log(`Wrote ${result.written} station positions.`);
    console.log('Derived from bus stops, not surveyed by the metro operator —');
    console.log('every row records coordinateSource and the stops it came from.');
    console.log('Next: npm run transit:project');
  } finally {
    await app.close();
  }
}

main().catch(error => {
  console.error(error?.message ?? error);
  process.exit(1);
});
