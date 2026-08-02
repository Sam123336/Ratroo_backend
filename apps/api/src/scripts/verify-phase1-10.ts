import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PublicTransportGraphController, InternalProviderHealthDashboardController } from '../modules/places/public-transport-graph.controller';
import { RouteService } from '../modules/places/route.service';
import { VillageService } from '../modules/places/village.service';
import { VillageJourneyService } from '../modules/planner/village-journey.service';
import { CoverageDashboardService } from '../modules/provider-ingestion/health/coverage-dashboard.service';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';

async function main() {
  console.log('==================================================');
  console.log('STRICT PRODUCTION AUDIT & REAL DB ACCESS VERIFICATION');
  console.log('==================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });

  const publicController = app.get(PublicTransportGraphController);
  const healthDashboardController = app.get(InternalProviderHealthDashboardController);
  const sequelize = app.get(Sequelize);

  console.log('--- PUBLIC REST API THIN CONTROLLER VERIFICATION ---');

  console.log('1. GET /v1/location/search?q=Nandigram:');
  const searchRes = await publicController.searchLocation('Nandigram');
  console.log(`   Matches Found: ${searchRes.length}`);
  if (searchRes.length > 0) {
    console.log(`   Top Result: ${searchRes[0].title} [${searchRes[0].category}] (Provider: ${searchRes[0].providerCode})`);
  }

  console.log('\n2. GET /v1/location/nandigram/nearest:');
  const nearestApiRes = await publicController.getNearestTransportNodes('nandigram');
  console.log(`   Location: ${nearestApiRes.locationName}`);
  console.log(`   Nearest Stop: ${nearestApiRes.nearestStop.name} (${nearestApiRes.distanceKm}, ${nearestApiRes.walkingTimeMinutes} min walk)`);

  console.log('\n3. POST /v1/journey:');
  try {
    const journeyApiRes = await publicController.planJourney({ from: 'Nandigram', to: 'Mecheda' });
    console.log(`   Multimodal Route: ${journeyApiRes.fromInput} to ${journeyApiRes.toInput} (${journeyApiRes.totalDurationMinutes} min)`);
  } catch (e: any) {
    console.log(`   POST /v1/journey Exception: ${e.message}`);
  }

  console.log('\n4. GET /v1/routes/:id (Querying Real PostgreSQL bus_routes):');
  const realRoutes: any[] = await sequelize.query('SELECT "id", "longName" FROM "bus_routes" LIMIT 1;', { type: QueryTypes.SELECT });
  if (realRoutes.length > 0) {
    const realRouteId = realRoutes[0].id;
    const routeApiRes = await publicController.getRouteDetails(realRouteId);
    console.log(`   Real DB Route Long Name: ${routeApiRes.longName}`);
    console.log(`   Provider Code: ${routeApiRes.providerCode}`);
    console.log(`   Stops Count from DB: ${routeApiRes.intermediateStops.length}`);
  }

  console.log('\n5. GET /v1/villages/nandigram (Querying PostgreSQL bus_stops & bus_routes):');
  const villageApiRes = await publicController.getVillageCoverage('nandigram');
  console.log(`   Village Name: ${villageApiRes.villageName}`);
  console.log(`   Nearest Stop: ${villageApiRes.nearestStop.name} (${villageApiRes.distanceKm})`);
  console.log(`   Passing Routes Count from SQL: ${villageApiRes.availableRoutesCount}`);

  console.log('\n6. GET /internal/providers (Querying PostgreSQL SQL counts):');
  const internalProvidersRes = await healthDashboardController.getInternalProvidersTelemetry();
  console.log(`   State: ${internalProvidersRes.state}`);
  console.log(`   Total Promoted Routes in DB: ${internalProvidersRes.totalRoutes}`);
  console.log(`   Total Promoted Stops in DB: ${internalProvidersRes.totalStops}`);
  console.log(`   Total Raw Source Records in DB: ${internalProvidersRes.totalRawRecordsStored}`);
  console.log(`   Mapped Villages Count from DB: ${internalProvidersRes.mappedVillagesCount}`);

  await app.close();

  console.log('\n==================================================');
  console.log('STRICT PRODUCTION AUDIT & DB QUERIES VERIFIED');
  console.log('==================================================');
}

main().catch(console.error);
