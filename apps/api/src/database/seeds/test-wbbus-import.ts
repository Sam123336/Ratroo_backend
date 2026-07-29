import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { ImportWBBusService } from './import-wbbus.service';
import * as fs from 'fs';
import * as path from 'path';

async function seed() {
  console.log('Initializing NestJS context for DB seed...');
  const app = await NestFactory.createApplicationContext(AppModule);
  const importer = app.get(ImportWBBusService);

  const busesPath = path.join(__dirname, '../../../../data/buses.json');
  if (!fs.existsSync(busesPath)) {
    console.error(`Scraped buses data not found at ${busesPath}`);
    await app.close();
    return;
  }

  const scrapedBuses = JSON.parse(fs.readFileSync(busesPath, 'utf8'));
  console.log(`Loaded ${scrapedBuses.length} scraped buses. Ingesting into database...`);

  await importer.importScrapedBuses(scrapedBuses);

  console.log('Seed completed successfully!');
  await app.close();
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
