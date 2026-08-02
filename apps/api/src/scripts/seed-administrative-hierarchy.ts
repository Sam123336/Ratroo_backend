import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Sequelize } from 'sequelize-typescript';
import { PlaceModel, PlaceType } from '../modules/places/infrastructure/sequelize/models/place.model';
import * as crypto from 'crypto';

const DISTRICTS_OF_WB = [
  'Alipurduar',
  'Bankura',
  'Birbhum',
  'Cooch Behar',
  'Dakshin Dinajpur',
  'Darjeeling',
  'Hooghly',
  'Howrah',
  'Jalpaiguri',
  'Jhargram',
  'Kalimpong',
  'Kolkata',
  'Malda',
  'Murshidabad',
  'Nadia',
  'North 24 Parganas',
  'Paschim Bardhaman',
  'Paschim Medinipur',
  'Purba Bardhaman',
  'Purba Medinipur',
  'Purulia',
  'South 24 Parganas',
  'Uttar Dinajpur',
];

async function main() {
  console.log('==================================================');
  console.log('SEED ADMINISTRATIVE HIERARCHY (Phase 2)');
  console.log('==================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const sequelize = app.get(Sequelize);

  // Sync the new models manually just in case DB_SYNCHRONIZE is false
  await sequelize.sync();

  console.log('Synchronized Place models.');

  try {
    // 1. Create State (West Bengal)
    const [statePlace, created] = await PlaceModel.findOrCreate({
      where: {
        type: PlaceType.STATE,
        canonicalName: 'West Bengal',
      },
      defaults: {
        id: crypto.randomUUID(),
        canonicalName: 'West Bengal',
        normalizedName: 'west bengal',
        type: PlaceType.STATE,
        latitude: 22.9868,
        longitude: 87.8550,
        confidence: 1.0,
        verified: true,
      },
    });

    if (created) {
      console.log(`Created State: West Bengal (${statePlace.id})`);
    } else {
      console.log(`Found State: West Bengal (${statePlace.id})`);
    }

    // 2. Create Districts
    let createdCount = 0;
    for (const districtName of DISTRICTS_OF_WB) {
      const [districtPlace, dCreated] = await PlaceModel.findOrCreate({
        where: {
          type: PlaceType.DISTRICT,
          canonicalName: districtName,
          stateId: statePlace.id,
        },
        defaults: {
          id: crypto.randomUUID(),
          canonicalName: districtName,
          normalizedName: districtName.toLowerCase(),
          type: PlaceType.DISTRICT,
          stateId: statePlace.id, // Link to West Bengal
          confidence: 1.0,
          verified: true,
        },
      });

      if (dCreated) {
        createdCount++;
        console.log(`  Created District: ${districtName} (${districtPlace.id})`);
      }
    }

    console.log(`\nSuccessfully seeded ${createdCount} new districts.`);
    console.log(`Total districts for West Bengal: ${DISTRICTS_OF_WB.length}`);
  } catch (error) {
    console.error('Error seeding hierarchy:', error);
  } finally {
    await app.close();
  }
}

main().catch(console.error);
