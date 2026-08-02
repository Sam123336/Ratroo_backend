import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { BusStopModel } from '../modules/provider-ingestion/infrastructure/sequelize/models/bus-network.model';
import { CanonicalStopResolutionEngine } from '../modules/provider-ingestion/enrichment/canonical-stop-resolution.engine';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';

async function main() {
  console.log('==================================================');
  console.log('PHASE 3.2: CANONICAL STOP RESOLUTION BACKFILL');
  console.log('==================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const engine = app.get(CanonicalStopResolutionEngine);
  const sequelize = app.get(Sequelize);

  try {
    // 1. Preload Graph
    await engine.preloadMemoryGraph();

    // 2. Fetch unlinked stops
    const stopsToProcess = await BusStopModel.findAll({
      where: {
        placeId: { [Op.is]: null }
      }
    });

    console.log(`Found ${stopsToProcess.length} raw provider stops needing canonical resolution.`);

    // 3. Process all in memory
    await engine.bulkResolveStops(stopsToProcess);

    console.log(`\nSuccessfully backfilled all stops.`);
  } catch (error) {
    console.error('Backfill failed:', error);
  } finally {
    await app.close();
  }
}

main().catch(console.error);
