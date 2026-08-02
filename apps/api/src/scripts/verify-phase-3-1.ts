import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const sequelize = app.get(Sequelize);

  try {
    console.log('\n--- Checking "places" table columns ---');
    const placesCols = await sequelize.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'places' AND column_name IN ('coordinateSource', 'coordinateConfidence', 'coordinateUpdatedAt', 'providerSource');`,
      { type: QueryTypes.SELECT }
    );
    console.table(placesCols);

    console.log('\n--- Checking "place_aliases" table columns ---');
    const aliasesCols = await sequelize.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'place_aliases' AND column_name = 'normalizedAlias';`,
      { type: QueryTypes.SELECT }
    );
    console.table(aliasesCols);

    console.log('\n--- Checking "place_merge_history" table exists ---');
    const historyTable = await sequelize.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'place_merge_history';`,
      { type: QueryTypes.SELECT }
    );
    console.table(historyTable);

    console.log('\n--- Checking "bus_stops" table for "placeId" ---');
    const busStopsCols = await sequelize.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'bus_stops' AND column_name = 'placeId';`,
      { type: QueryTypes.SELECT }
    );
    console.table(busStopsCols);

  } catch (err) {
    console.error(err);
  } finally {
    await app.close();
  }
}

main();
