import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';

async function main() {
  console.log('==================================================');
  console.log('GEOSPATIAL AUDIT & COORDINATE SANITY CHECK');
  console.log('==================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const sequelize = app.get(Sequelize);

  // 1. Audit Invalid Coordinates in bus_stops
  const invalidStopsCount: Array<{ count: string }> = await sequelize.query(
    `SELECT COUNT(*) as count FROM "bus_stops"
     WHERE "metadata"->>'latitude' IS NULL
        OR "metadata"->>'longitude' IS NULL
        OR CAST("metadata"->>'latitude' AS FLOAT) = 0
        OR CAST("metadata"->>'longitude' AS FLOAT) = 0
        OR CAST("metadata"->>'latitude' AS FLOAT) > 90
        OR CAST("metadata"->>'longitude' AS FLOAT) > 180;`,
    { type: QueryTypes.SELECT }
  );

  console.log('1. SQL Query for Invalid / Missing Coordinates in "bus_stops":');
  console.log(`   Invalid/Missing Coordinate Count: ${invalidStopsCount[0]?.count}\n`);

  // 2. Audit Regional Breakdown of bus_stops
  const wbStopsCount: Array<{ count: string }> = await sequelize.query(
    `SELECT COUNT(*) as count FROM "bus_stops"
     WHERE CAST("metadata"->>'latitude' AS FLOAT) BETWEEN 21.5 AND 27.5
       AND CAST("metadata"->>'longitude' AS FLOAT) BETWEEN 85.8 AND 89.9;`,
    { type: QueryTypes.SELECT }
  );

  console.log('2. SQL Query for West Bengal Bounding Box (21.5°N - 27.5°N, 85.8°E - 89.9°E):');
  console.log(`   West Bengal Spatial Stops Count: ${wbStopsCount[0]?.count}\n`);

  // 3. Audit Provider Breakdown in bus_stops
  const providerStops: Array<{ providerCode: string; count: string }> = await sequelize.query(
    `SELECT "providerCode", COUNT(*) as count FROM "bus_stops" GROUP BY "providerCode";`,
    { type: QueryTypes.SELECT }
  );

  console.log('3. SQL Query for Provider Breakdown in "bus_stops":');
  console.table(providerStops);

  await app.close();
}

main().catch(console.error);
