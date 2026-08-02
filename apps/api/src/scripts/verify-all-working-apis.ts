import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { UniversalSearchService } from '../modules/places/universal-search.service';
import { RouteService } from '../modules/places/route.service';
import { VillageService } from '../modules/places/village.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const search = app.get(UniversalSearchService);
  const route = app.get(RouteService);
  const village = app.get(VillageService);

  console.log('--- Testing Search ---');
  try {
    const searchRes = await search.search('Arambag');
    console.log(`Found ${searchRes.length} results. First result: ${searchRes[0]?.title}`);

    if (searchRes.length > 0) {
      console.log('\n--- Testing Village Coverage ---');
      try {
        const coverage = await village.getVillageCoverageById(searchRes[0].id);
        console.log('Nearest Stop:', coverage.nearestStop.name, '| Distance:', coverage.distanceKm);
      } catch (e) {
        console.error('Village coverage failed:', e.message);
      }

      console.log('\n--- Testing Routes passing Stop ---');
      try {
        const routes = await route.findRoutesPassingStop(searchRes[0].id);
        console.log(`Found ${routes.length} routes. First route: ${routes[0]?.longName}`);

        if (routes.length > 0) {
          console.log('\n--- Testing Route By Id ---');
          const routeDetails = await route.getRouteById(routes[0].id);
          console.log('Route stops count:', routeDetails.intermediateStops.length);
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
