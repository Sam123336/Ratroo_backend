import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { SearchService } from '../modules/search/services/search.service';
import { RouteService } from '../modules/routes/services/route.service';
import { VillageService } from '../modules/villages/services/village.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const search = app.get(SearchService);
  const route = app.get(RouteService);
  const village = app.get(VillageService);

  console.log('--- Testing Search ---');
  try {
    const searchResult = await search.search('Arambag');
    const searchData = searchResult.data;
    console.log(`Found ${searchData.length} results. First result: ${searchData[0]?.title}`);
    console.log(`Search Metadata Confidence:`, searchResult.metadata.confidenceScore);

    if (searchData.length > 0) {
      console.log('\n--- Testing Village Coverage ---');
      try {
        const coverageResult = await village.getVillageCoverageById(searchData[0].id);
        const coverage = coverageResult.data;
        console.log('Nearest Stop:', coverage.nearestStop.name, '| Distance:', coverage.distanceKm);
        console.log(`Coverage Metadata Confidence:`, coverageResult.metadata.confidenceScore);
      } catch (e) {
        console.error('Village coverage failed:', e.message);
      }

      console.log('\n--- Testing Routes passing Stop ---');
      try {
        const routes = await route.findRoutesPassingPlace(searchData[0].id);
        console.log(`Found ${routes.length} routes. First route: ${routes[0]?.longName}`);

        if (routes.length > 0) {
          console.log('\n--- Testing Route By Id ---');
          const routeResult = await route.getRouteById(routes[0].id);
          const routeDetails = routeResult.data;
          console.log('Route stops count:', routeDetails.intermediateStops.length);
          console.log(`Route Metadata DeepLinks:`, routeResult.metadata.deepLinks?.length);
        }
      } catch (e) {
        console.error('Route queries failed:', e.message);
      }
    }
  } catch (e) {
    console.error('Search failed:', e);
  }

  await app.close();
  process.exit(0);
}

bootstrap().catch(console.error);
