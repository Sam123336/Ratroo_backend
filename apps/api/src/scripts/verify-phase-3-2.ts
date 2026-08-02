import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const sequelize = app.get(Sequelize);

  try {
    console.log('\n--- Phase 3.2 Verification Metrics ---');
    
    const unlinked = await sequelize.query(
      `SELECT COUNT(*) as "unlinked_stops" FROM bus_stops WHERE "placeId" IS NULL;`,
      { type: QueryTypes.SELECT }
    );
    console.table(unlinked);

    const linked = await sequelize.query(
      `SELECT COUNT(*) as "linked_stops" FROM bus_stops WHERE "placeId" IS NOT NULL;`,
      { type: QueryTypes.SELECT }
    );
    console.table(linked);

    const canonicalPlaces = await sequelize.query(
      `SELECT COUNT(*) as "canonical_places_created" FROM places WHERE type = 'STOP';`,
      { type: QueryTypes.SELECT }
    );
    console.table(canonicalPlaces);

    const placeAliases = await sequelize.query(
      `SELECT COUNT(*) as "place_aliases_created" FROM place_aliases;`,
      { type: QueryTypes.SELECT }
    );
    console.table(placeAliases);

    const duplicateCheck = await sequelize.query(
      `SELECT "normalizedName", COUNT(*) as count 
       FROM places 
       WHERE type = 'STOP' 
       GROUP BY "normalizedName" 
       HAVING COUNT(*) > 1 
       ORDER BY count DESC LIMIT 5;`,
      { type: QueryTypes.SELECT }
    );
    
    console.log('\n--- Checking for accidental duplicate canonical names ---');
    if (duplicateCheck.length === 0) {
      console.log('✅ No duplicates found! Deduplication was completely successful.');
    } else {
      console.table(duplicateCheck);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await app.close();
  }
}

main();
