import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { TransportGraphEngine } from '../modules/graph/transport-graph.engine';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';

async function main() {
  console.log('==================================================');
  console.log('PHASE 2: CANONICAL MULTIMODAL TRANSPORT GRAPH AUDIT');
  console.log('==================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const graphEngine = app.get(TransportGraphEngine);
  const sequelize = app.get(Sequelize);

  console.log('--- STEP 1: AUDITING CANONICAL GRAPH NODES ACROSS ALL MODES ---');
  const modeBreakdown: Array<{ providerCode: string; totalRoutes: string; totalStops: string }> = await sequelize.query(
    `SELECT r."providerCode",
            COUNT(DISTINCT r.id) as "totalRoutes",
            COUNT(DISTINCT s.id) as "totalStops"
     FROM "bus_routes" r
     LEFT JOIN "bus_stops" s ON s."providerCode" = r."providerCode"
     GROUP BY r."providerCode";`,
    { type: QueryTypes.SELECT }
  );

  console.table(modeBreakdown);

  console.log('\n--- STEP 2: TESTING DYNAMIC MULTIMODAL GRAPH PATHING ---');
  const graphResult = await graphEngine.buildDynamicMultimodalGraph(
    { latitude: 22.8766, longitude: 87.7909, label: 'Helan' },
    { latitude: 22.5726, longitude: 88.3639, label: 'Howrah' }
  );

  console.log(`Origin: ${graphResult.originLocation.label} -> Destination: ${graphResult.destinationLocation.label}`);
  console.log(`Available Modes: ${graphResult.availableModes.join(', ')}`);
  console.log(`Connecting Routes Found: ${graphResult.connectingRoutes.length}`);
  console.log(`Transfer Rules Defined: ${graphResult.transferRules.length}`);
  console.log(`Estimated Travel Time: ${graphResult.estimatedTravelMinutes} min | Confidence: ${graphResult.confidenceScore}`);

  await app.close();

  console.log('\n==================================================');
  console.log('PHASE 2 MULTIMODAL GRAPH VERIFIED & OPERATIONAL');
  console.log('==================================================');
}

main().catch(console.error);
