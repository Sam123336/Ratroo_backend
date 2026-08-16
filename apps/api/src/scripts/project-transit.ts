/**
 * Republish the promoted bus_* network into the canonical transit tables that
 * /v1/routes, /v1/stops/nearby and /v1/journey read.
 *
 *   npm run transit:project
 *
 * Same work as POST /internal/cron/project-transit, run in-process. Preferred
 * after a large import: the HTTP route is subject to whatever request timeout
 * sits in front of it, and a full projection runs for minutes.
 */
import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { CanonicalTransitProjectionService } from '../modules/provider-ingestion/application/CanonicalTransitProjectionService';

config();

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const counts = await app.get(CanonicalTransitProjectionService).project();
    console.log(`PROJECTION ${JSON.stringify(counts)}`);
  } finally {
    await app.close();
  }
}

main().catch(error => {
  console.error(`PROJECTION FAILED: ${error?.message ?? error}`);
  process.exit(1);
});
