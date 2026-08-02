import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataQualityEnrichmentEngine } from '../modules/provider-ingestion/enrichment/data-quality-enrichment.engine';
import { InternalOpsDashboardController } from '../modules/provider-ingestion/health/internal-ops-dashboard.controller';

async function main() {
  console.log('==================================================');
  console.log('PHASE 1: DATA QUALITY & COORDINATE ENRICHMENT LOOP');
  console.log('==================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const qualityEngine = app.get(DataQualityEnrichmentEngine);
  const dashboardController = app.get(InternalOpsDashboardController);

  console.log('--- STEP 1: EXECUTING PHASE 1 DATA QUALITY & CASCADE ENGINE ---');
  const report = await qualityEngine.runPhase1DataQualityEnrichment();

  console.log(`Unlocated Stops Evaluated: ${report.totalUnlocatedStopsFound}`);
  console.log(`Stops Successfully Enriched with Lat/Lon: ${report.totalStopsEnriched}`);
  console.log(`  - DB Matches: ${report.dbMatchesCount}`);
  console.log(`  - OSM Matches: ${report.osmMatchesCount}`);
  console.log(`  - Census Centroid Matches: ${report.censusCentroidMatchesCount}`);
  console.log(`Duplicate Stop Name Aliases Merged: ${report.duplicateStopAliasesMerged}`);
  console.log(`System-Wide Canonical Graph Coverage: ${report.systemWideCanonicalGraphCoveragePercentage}\n`);

  console.log('--- STEP 2: VERIFYING UPDATED PROVIDER QUALITY DASHBOARD ---');
  const qualityRes = await dashboardController.getProviderQualityDashboard();
  console.table(
    qualityRes.qualityMetrics.map((m) => ({
      ProviderCode: m.providerCode,
      Routes: m.routesCount,
      Stops: m.stopsCount,
      CoordCoverage: m.coverage.coordinateCoveragePercentage,
      DupStopNames: m.duplicates.duplicateStopNamesCount,
      ParseSuccessRate: m.parseSuccessRatePercentage,
      PromotionSuccessRate: m.promotionSuccessRatePercentage,
      ComputedHealth: m.status,
      HealthReason: m.statusReason,
    }))
  );

  await app.close();

  console.log('\n==================================================');
  console.log('PHASE 1 DATA QUALITY & COORDINATE ENRICHMENT COMPLETE');
  console.log('==================================================');
}

main().catch(console.error);
