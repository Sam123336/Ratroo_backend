/**
 * Stage and promote the BMTC harvest into the rider-facing tables.
 *
 *   npm run bmtc:promote -- --dry     # stage, report, roll back
 *   npm run bmtc:promote              # stage and promote for real
 *
 * Reads `.bmtc-cache/canonical.json` from `npm run bmtc:ingest`.
 *
 * Promoting is not the last step. BMTC publishes only each trip's first and
 * last call, so a mid-route stop has no time until:
 *
 *   npm run timetables:interpolate
 *
 * fills the gaps and marks them INTERPOLATED — the same treatment the ~450
 * untimed WBBUS routes get.
 */
import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { join } from 'path';
import { AppModule } from '../app.module';
import { BmtcStaticImportService } from '../modules/provider-ingestion/application/BmtcStaticImportService';

config();

async function main() {
  const dryRun = process.argv.includes('--dry');
  // `indexOf` returns -1 when the flag is absent, and argv[-1 + 1] is argv[0] —
  // the ts-node binary. Without this guard the default path is silently
  // replaced by a shebang script, which fails as "Unexpected token '#'".
  const fileFlag = process.argv.indexOf('--file');
  const file =
    fileFlag >= 0 && process.argv[fileFlag + 1]
      ? process.argv[fileFlag + 1]
      : join(process.cwd(), '.bmtc-cache', 'canonical.json');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const service = app.get(BmtcStaticImportService);
    console.log(`${dryRun ? 'DRY RUN' : 'PROMOTING'} from ${file}`);
    const result = await service.importFromFile(file, { dryRun });

    console.log('');
    console.log('staged');
    for (const [k, v] of Object.entries(result.staged)) {
      console.log(`  ${k.padEnd(12)} ${v}`);
    }
    console.log('');
    console.log(`dataset version  ${result.datasetVersionId}`);
    console.log(`promoted         ${result.promoted}`);
    if (result.promotion) console.log(`result           ${JSON.stringify(result.promotion)}`);

    if (dryRun) {
      console.log('');
      console.log('Rolled back — nothing was written. Re-run without --dry to apply.');
    } else {
      console.log('');
      console.log('Next: npm run timetables:interpolate   (fills intermediate stops as INTERPOLATED)');
    }
  } finally {
    await app.close();
  }
}

main().catch(error => {
  console.error(error?.message ?? error);
  process.exit(1);
});
