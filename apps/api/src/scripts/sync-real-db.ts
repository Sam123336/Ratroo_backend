import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { GenericProviderIngestionService } from '../modules/provider-ingestion/application/GenericProviderIngestionService';
import { WBBusProvider } from '../modules/provider-ingestion/providers/wbbus.provider';
import { WBBustimeProvider } from '../modules/provider-ingestion/providers/wbbustime.provider';
import { BusSathiProvider } from '../modules/provider-ingestion/providers/bussathi.provider';
import { OpenStreetMapProvider } from '../modules/provider-ingestion/providers/openstreetmap.provider';
import { NominatimProvider } from '../modules/provider-ingestion/providers/nominatim.provider';
import { CensusIndiaProvider } from '../modules/provider-ingestion/providers/census-india.provider';
import { DataGovIndiaProvider } from '../modules/provider-ingestion/providers/data-gov-india.provider';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';

async function main() {
  console.log('==================================================');
  console.log('EXECUTING REAL SUPABASE POSTGRES INGESTION & PROMOTION');
  console.log('==================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const genericService = app.get(GenericProviderIngestionService);
  const sequelize = app.get(Sequelize);

  const providers = [
    app.get(WBBustimeProvider),
    app.get(BusSathiProvider),
    app.get(OpenStreetMapProvider),
    app.get(NominatimProvider),
    app.get(CensusIndiaProvider),
    app.get(DataGovIndiaProvider),
    app.get(WBBusProvider),
  ];

  console.log('--- RUNNING INGESTION PIPELINES AGAINST REAL SUPABASE DB ---\n');

  for (const provider of providers) {
    console.log(`Syncing provider: ${provider.providerCode}...`);
    try {
      const result = await genericService.runIngestionPipeline(provider);
      console.log(`✅ [${result.providerCode}] SUCCESS:`);
      console.log(`   - Dataset Version ID: ${result.datasetVersionId}`);
      console.log(`   - Pages Fetched: ${result.pagesFetched}`);
      console.log(`   - Raw Documents Stored: ${result.rawDocumentsStored}`);
      console.log(`   - Records Parsed: ${result.recordsParsed}`);
      console.log(`   - Discovered Routes: ${result.routesDiscovered}`);
      console.log(`   - Discovered Stops: ${result.stopsDiscovered}`);
      console.log(`   - Route-Stop Relations: ${result.routeStopsDiscovered}`);
      console.log(`   - Sync Duration: ${result.syncDurationMs} ms`);
      console.log(`   - Promotion Status: ${result.promotedStatus}\n`);
    } catch (err) {
      console.error(`❌ [${provider.providerCode}] FAILED:`, err instanceof Error ? err.message : err);
    }
  }

  console.log('==================================================');
  console.log('REAL DATABASE VERIFICATION (DIRECT SQL QUERIES)');
  console.log('==================================================\n');

  // 1. SELECT "providerCode", "longName" FROM "bus_routes" WHERE "providerCode"='WBBUSTIME';
  const wbbustimeRoutes = await sequelize.query(
    'SELECT "providerCode", "longName" FROM "bus_routes" WHERE "providerCode"=\'WBBUSTIME\';',
    { type: QueryTypes.SELECT }
  );
  console.log('1. SELECT "providerCode", "longName" FROM "bus_routes" WHERE "providerCode"=\'WBBUSTIME\';');
  console.table(wbbustimeRoutes);

  // 2. SELECT "providerCode", COUNT(*) FROM "raw_source_records" GROUP BY "providerCode";
  const rawCounts = await sequelize.query(
    'SELECT "providerCode", COUNT(*) as count FROM "raw_source_records" GROUP BY "providerCode";',
    { type: QueryTypes.SELECT }
  );
  console.log('\n2. SELECT "providerCode", COUNT(*) FROM "raw_source_records" GROUP BY "providerCode";');
  console.table(rawCounts);

  // 3. SELECT "providerCode", COUNT(*) FROM "staged_routes" GROUP BY "providerCode";
  const stagedRouteCounts = await sequelize.query(
    'SELECT "providerCode", COUNT(*) as count FROM "staged_routes" GROUP BY "providerCode";',
    { type: QueryTypes.SELECT }
  );
  console.log('\n3. SELECT "providerCode", COUNT(*) FROM "staged_routes" GROUP BY "providerCode";');
  console.table(stagedRouteCounts);

  // 4. SELECT "providerCode", COUNT(*) FROM "bus_routes" GROUP BY "providerCode";
  const busRouteCounts = await sequelize.query(
    'SELECT "providerCode", COUNT(*) as count FROM "bus_routes" GROUP BY "providerCode";',
    { type: QueryTypes.SELECT }
  );
  console.log('\n4. SELECT "providerCode", COUNT(*) FROM "bus_routes" GROUP BY "providerCode";');
  console.table(busRouteCounts);

  // 5. SELECT name FROM "bus_stops" WHERE "providerCode"='WBBUSTIME' LIMIT 20;
  const wbStops = await sequelize.query(
    'SELECT name FROM "bus_stops" WHERE "providerCode"=\'WBBUSTIME\' LIMIT 20;',
    { type: QueryTypes.SELECT }
  );
  console.log('\n5. SELECT name FROM "bus_stops" WHERE "providerCode"=\'WBBUSTIME\' LIMIT 20;');
  console.table(wbStops);

  // 6. SELECT "longName" FROM "bus_routes" WHERE "providerCode"='WBBUSTIME' LIMIT 20;
  const wbRoutes = await sequelize.query(
    'SELECT "longName" FROM "bus_routes" WHERE "providerCode"=\'WBBUSTIME\' LIMIT 20;',
    { type: QueryTypes.SELECT }
  );
  console.log('\n6. SELECT "longName" FROM "bus_routes" WHERE "providerCode"=\'WBBUSTIME\' LIMIT 20;');
  console.table(wbRoutes);

  await app.close();
  console.log('\n==================================================');
  console.log('REAL SUPABASE DB INGESTION & PROMOTION VERIFIED');
  console.log('==================================================');
}

main().catch(console.error);
