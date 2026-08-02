import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { StopDeduplicationService } from '../modules/provider-ingestion/enrichment/stop-deduplication.service';

async function main() {
  console.log('=== CANONICAL STOP ENGINE: Merge + Classify ===\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const dedup = app.get(StopDeduplicationService);

  console.log('--- Step 1: Merging duplicate stops ---');
  const mergeReport = await dedup.mergeAllDuplicateStops();
  console.log(`Groups processed: ${mergeReport.totalGroupsProcessed}`);
  console.log(`Stops merged: ${mergeReport.totalStopsMerged}`);
  console.log(`Route-stop refs updated: ${mergeReport.totalRouteStopRefsUpdated}`);
  console.log(`Canonical stops created: ${mergeReport.canonicalStopsCreated}`);

  console.log('\n--- Step 2: Classifying orphan stops ---');
  const orphanReport = await dedup.classifyOrphanStops();
  console.log(`Total orphans: ${orphanReport.totalOrphans}`);
  console.log(`Pending: ${orphanReport.pendingCount}`);
  console.log(`Orphan: ${orphanReport.orphanCount}`);
  console.log(`Stale: ${orphanReport.staleCount}`);

  await app.close();
  console.log('\n=== DONE ===');
}

main().catch(console.error);
