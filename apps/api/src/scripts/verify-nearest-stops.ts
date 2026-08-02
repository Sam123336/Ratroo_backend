import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { VillageService } from '../modules/places/village.service';
import { BusStopModel } from '../modules/provider-ingestion/infrastructure/sequelize/models/bus-network.model';

async function main() {
  console.log('==================================================');
  console.log('GEOSPATIAL ACCURACY VERIFICATION (NEAREST STOP ENGINE)');
  console.log('==================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const villageService = app.get(VillageService);

  const testLocations = [
    'Majpur',
    'Helan',
    'Nandigram',
    'Arambagh',
    'Tarakeswar',
    'Pursurah',
  ];

  console.log('--- NEAREST STOP VERIFICATION RESULTS ---');
  console.log('--------------------------------------------------');

  const summaryRows: any[] = [];

  for (const locationQuery of testLocations) {
    try {
      const res = await villageService.getVillageCoverageById(locationQuery);
      const stopRecord = await BusStopModel.findByPk(res.villageId);
      const lat = (stopRecord?.metadata as any)?.latitude || 'N/A';
      const lon = (stopRecord?.metadata as any)?.longitude || 'N/A';

      summaryRows.push({
        Query: locationQuery,
        'Village/Place Name': res.villageName,
        'Coordinates (Lat, Lon)': `${lat}, ${lon}`,
        'Nearest Stop Name': res.nearestStop.name,
        'Distance (km)': res.distanceKm,
        'Walking Time': `${res.walkingTimeMinutes} min`,
        Provider: res.nearestStop.providerCode,
      });
    } catch (e: any) {
      console.error(`❌ Error verifying ${locationQuery}: ${e.message}`);
    }
  }

  console.table(summaryRows);

  await app.close();

  console.log('\n==================================================');
  console.log('GEOSPATIAL ACCURACY VERIFICATION COMPLETE');
  console.log('==================================================');
}

main().catch(console.error);
