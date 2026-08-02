import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { InternalOpsDashboardController } from '../modules/provider-ingestion/health/internal-ops-dashboard.controller';

async function main() {
  console.log('==================================================');
  console.log('DYNAMIC PROVIDER QUALITY DASHBOARD VERIFICATION');
  console.log('==================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const dashboardController = app.get(InternalOpsDashboardController);

  console.log('--- STEP 1: FETCHING COMPUTED PROVIDER QUALITY METRICS ---');
  const res = await dashboardController.getProviderQualityDashboard();

  console.log(`Timestamp: ${res.timestamp}`);
  console.log(`Monitored Providers Count: ${res.providersCount}\n`);

  console.log('--------------------------------------------------');
  console.log('PROVIDER QUALITY METRICS DASHBOARD TABLE:');
  console.table(
    res.qualityMetrics.map((m) => ({
      ProviderCode: m.providerCode,
      Routes: m.routesCount,
      Stops: m.stopsCount,
      CoordCoverage: m.coverage.coordinateCoveragePercentage,
      TimetableCoverage: m.coverage.timetableCoveragePercentage,
      FareCoverage: m.coverage.fareCoveragePercentage,
      DupStopNames: m.duplicates.duplicateStopNamesCount,
      DupCoords: m.duplicates.duplicateCoordinatesCount,
      ParseSuccessRate: m.parseSuccessRatePercentage,
      PromotionSuccessRate: m.promotionSuccessRatePercentage,
      RawRecords: m.rawRecordsCount,
      ComputedHealth: m.status,
      HealthReason: m.statusReason,
    }))
  );

  console.log('\n--- STEP 2: TESTING GET /internal/dashboard/provider/BUSSATHI DETAIL ENDPOINT ---');
  const detailRes = await dashboardController.getProviderDetail('BUSSATHI');
  console.log(`Provider: ${detailRes.providerName}`);
  console.log(`Dataset Version ID: ${detailRes.datasetVersionId}`);
  console.log(`Computed Health: ${detailRes.status} (${detailRes.statusReason})`);
  console.log(`Recent Changes Count: ${detailRes.recentChanges.length}`);
  console.log(`Recent Crawl Logs Count: ${detailRes.recentCrawlLogs.length}`);

  await app.close();

  console.log('\n==================================================');
  console.log('PROVIDER QUALITY DASHBOARD VERIFIED SUCCESSFULLY');
  console.log('==================================================');
}

main().catch(console.error);
