import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const sequelize = app.get(Sequelize);

  try {
    console.log('Running ALTER statements manually...');

    // 1. places
    await sequelize.query(`ALTER TABLE "places" ADD COLUMN IF NOT EXISTS "providerSource" VARCHAR(255);`);
    await sequelize.query(`ALTER TABLE "places" ADD COLUMN IF NOT EXISTS "coordinateSource" VARCHAR(255);`);
    await sequelize.query(`ALTER TABLE "places" ADD COLUMN IF NOT EXISTS "coordinateConfidence" FLOAT;`);
    await sequelize.query(`ALTER TABLE "places" ADD COLUMN IF NOT EXISTS "coordinateUpdatedAt" TIMESTAMP WITH TIME ZONE;`);

    // 2. place_aliases
    await sequelize.query(`ALTER TABLE "place_aliases" ADD COLUMN IF NOT EXISTS "normalizedAlias" VARCHAR(255);`);
    // Create index on normalizedAlias
    await sequelize.query(`CREATE INDEX IF NOT EXISTS "place_aliases_normalizedAlias_idx" ON "place_aliases" ("normalizedAlias");`);

    // 3. bus_stops
    await sequelize.query(`ALTER TABLE "bus_stops" ADD COLUMN IF NOT EXISTS "placeId" UUID;`);
    
    // We should also create the place_merge_history table since sync failed
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "place_merge_history" (
        "id" UUID PRIMARY KEY,
        "sourcePlaceId" UUID REFERENCES "places"("id") ON DELETE SET NULL,
        "targetPlaceId" UUID REFERENCES "places"("id") ON DELETE CASCADE,
        "reason" VARCHAR(255),
        "mergedBy" VARCHAR(255),
        "mergedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL
      );
    `);

    console.log('Migration successful!');
  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    await app.close();
  }
}

main().catch(console.error);
