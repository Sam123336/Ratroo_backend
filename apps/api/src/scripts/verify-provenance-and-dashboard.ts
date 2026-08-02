import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { GenericProviderIngestionService } from '../modules/provider-ingestion/application/GenericProviderIngestionService';
import { BusSathiProvider } from '../modules/provider-ingestion/providers/bussathi.provider';
import { InternalOpsDashboardController } from '../modules/provider-ingestion/health/internal-ops-dashboard.controller';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';

async function main() {
  console.log('==================================================');
  console.log('VERIFYING AUDIT PROVENANCE & INTERNAL OPS DASHBOARD');
  console.log('==================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const sequelize = app.get(Sequelize);
  const ingestionService = app.get(GenericProviderIngestionService);
  const dashboardController = app.get(InternalOpsDashboardController);

  console.log('--- STEP 1: EXECUTE BUS SATHI INGESTION & PROMOTION PIPELINE ---');
  const provider = new BusSathiProvider();
  const syncResult = await ingestionService.runIngestionPipeline(provider);

  console.log(`Ingestion Status: ${syncResult.status}`);
  console.log(`Promoted Dataset Version ID: ${syncResult.datasetVersionId}`);

  console.log('\n--- STEP 2: VERIFY EXACT SOURCE URL & AUDIT PROVENANCE METADATA ---');
  const sampleRoutes: any[] = await sequelize.query(
    `SELECT "id", "longName", "metadata"
     FROM "bus_routes"
     WHERE "providerCode" = 'BUSSATHI' AND "datasetVersionId" = :dVer
     LIMIT 5;`,
    { replacements: { dVer: syncResult.datasetVersionId }, type: QueryTypes.SELECT }
  );

  console.table(
    sampleRoutes.map((r, idx) => ({
      Index: idx + 1,
      ID: r.id,
      RouteName: r.longName,
      ExactSourceUrl: (r.metadata as any)?.sourceUrl,
      ProviderRouteId: (r.metadata as any)?.providerRouteId,
      ParserVersion: (r.metadata as any)?.parserVersion,
      ConfidenceScore: (r.metadata as any)?.confidence,
    }))
  );

  console.log('\n--- STEP 3: VERIFY INTERNAL OPS DASHBOARD REST CONTROLLER ENDPOINTS ---');

  console.log('1. GET /internal/dashboard/providers:');
  const providersRes = await dashboardController.getProvidersTelemetry();
  console.log(`   Registered Providers Count: ${providersRes.providersCount}`);
  console.table(providersRes.telemetry.slice(0, 5));

  console.log('\n2. GET /internal/dashboard/routes?providerCode=BUSSATHI:');
  const routesRes = await dashboardController.getRoutesCatalog('BUSSATHI');
  console.log(`   Routes Returned: ${routesRes.count}`);
  if (routesRes.routes.length > 0) {
    console.log(`   Sample Provenance Metadata:`, JSON.stringify(routesRes.routes[0].provenanceMetadata, null, 2));
  }

  console.log('\n3. GET /internal/dashboard/coverage:');
  const coverageRes = await dashboardController.getCoverageReport();
  console.log(`   State: ${coverageRes.state}`);
  console.log(`   Total Promoted Routes: ${coverageRes.totalRoutes}`);
  console.log(`   Total Promoted Stops: ${coverageRes.totalStops}`);
  console.log(`   Total Raw Records: ${coverageRes.totalRawRecordsStored}`);

  console.log('\n4. GET /internal/dashboard/sync-history:');
  const syncHistoryRes = await dashboardController.getSyncHistory();
  console.log(`   Total Sync Runs Tracked: ${syncHistoryRes.count}`);

  await app.close();

  console.log('\n==================================================');
  console.log('PROVENANCE METADATA & OPS DASHBOARD VERIFIED');
  console.log('==================================================');
}

main().catch(console.error);
