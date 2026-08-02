import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { CanonicalStopResolutionEngine } from '../modules/provider-ingestion/enrichment/canonical-stop-resolution.engine';
import { BusStopModel } from '../modules/provider-ingestion/infrastructure/sequelize/models/bus-network.model';
import { PlaceModel, PlaceType, PlaceAliasModel } from '../modules/places/infrastructure/sequelize/models/place.model';
import * as crypto from 'crypto';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const engine = app.get(CanonicalStopResolutionEngine);

  try {
    console.log('--- Phase 3.3 Idempotency Test ---');
    
    const countBefore = await PlaceModel.count();
    const aliasCountBefore = await PlaceAliasModel.count();

    // 1. Create a dummy BusStopModel with an existing canonical name like 'Burdwan'
    const dummyStop = await BusStopModel.create({
      id: crypto.randomUUID(),
      providerCode: 'WBBUS',
      providerStopId: 'test_123',
      externalId: 'test_123',
      name: 'Burdwan Bus Stand', // This should resolve to 'bardhaman'
      normalizedName: 'burdwan bus stand',
      metadata: {},
      datasetVersionId: crypto.randomUUID(),
    });

    // 2. Resolve it
    await engine.bulkResolveStops([dummyStop as any]);

    const countAfter = await PlaceModel.count();
    const aliasCountAfter = await PlaceAliasModel.count();
    const resolvedStop = await BusStopModel.findByPk(dummyStop.id);

    console.log(`\nPlaces Before: ${countBefore} | Places After: ${countAfter}`);
    console.log(`Aliases Before: ${aliasCountBefore} | Aliases After: ${aliasCountAfter}`);
    console.log(`Linked Place ID: ${resolvedStop?.placeId}`);

    if (countAfter === countBefore && resolvedStop?.placeId !== null) {
      console.log('✅ Idempotency test passed! No duplicate places created.');
    } else {
      console.log('❌ Idempotency test failed.');
    }

    // Cleanup
    await dummyStop.destroy();
  } catch (err) {
    console.error(err);
  } finally {
    await app.close();
  }
}

main();
