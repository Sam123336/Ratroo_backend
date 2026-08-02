import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';
import { BusStopModel } from '../modules/provider-ingestion/infrastructure/sequelize/models/bus-network.model';
import { ensureUuidV7 } from '../shared/ids/uuid-v7';

interface VillageStopSeed {
  name: string;
  normalizedName: string;
  providerCode: 'CENSUS_INDIA' | 'OPENSTREETMAP' | 'WBBUSTIME' | 'WBBUS';
  lat: number;
  lon: number;
  district: string;
  block: string;
  gp?: string;
}

const wbNodes: VillageStopSeed[] = [
  // Hooghly District Villages & Bus Stops
  { name: 'Majpur Village', normalizedName: 'majpur village', providerCode: 'CENSUS_INDIA', lat: 22.7612, lon: 87.9218, district: 'Hooghly', block: 'Pursurah', gp: 'Gopalnagar' },
  { name: 'Majpur Bus Stop', normalizedName: 'majpur bus stop', providerCode: 'WBBUSTIME', lat: 22.7630, lon: 87.9235, district: 'Hooghly', block: 'Pursurah' },
  { name: 'Helan Village', normalizedName: 'helan village', providerCode: 'CENSUS_INDIA', lat: 22.8712, lon: 87.9812, district: 'Hooghly', block: 'Pursurah', gp: 'Helan' },
  { name: 'Helan Bazar Bus Stop', normalizedName: 'helan bazar bus stop', providerCode: 'WBBUSTIME', lat: 22.8725, lon: 87.9825, district: 'Hooghly', block: 'Pursurah' },
  { name: 'Pursurah Bus Stand', normalizedName: 'pursurah bus stand', providerCode: 'WBBUS', lat: 22.8465, lon: 87.9575, district: 'Hooghly', block: 'Pursurah' },
  { name: 'Arambagh Bus Stand', normalizedName: 'arambagh bus stand', providerCode: 'WBBUSTIME', lat: 22.8766, lon: 87.7909, district: 'Hooghly', block: 'Arambagh' },
  { name: 'Tarakeswar Bus Stand', normalizedName: 'tarakeswar bus stand', providerCode: 'WBBUSTIME', lat: 22.8872, lon: 88.0205, district: 'Hooghly', block: 'Tarakeswar' },
  
  // Purba Medinipur Villages & Bus Stops
  { name: 'Nandigram Village', normalizedName: 'nandigram village', providerCode: 'CENSUS_INDIA', lat: 22.0000, lon: 87.9800, district: 'Purba Medinipur', block: 'Nandigram I', gp: 'Nandigram' },
  { name: 'Nandigram Bus Stand', normalizedName: 'nandigram bus stand', providerCode: 'WBBUSTIME', lat: 22.0035, lon: 87.9820, district: 'Purba Medinipur', block: 'Nandigram I' },
  { name: 'Chandipur Bus Stop', normalizedName: 'chandipur bus stop', providerCode: 'WBBUSTIME', lat: 22.1384, lon: 87.8481, district: 'Purba Medinipur', block: 'Chandipur' },
  { name: 'Mecheda Bus Terminus', normalizedName: 'mecheda bus terminus', providerCode: 'WBBUSTIME', lat: 22.4418, lon: 87.9625, district: 'Purba Medinipur', block: 'Kolaghat' },
  { name: 'Kolipat Bus Stop', normalizedName: 'kolipat bus stop', providerCode: 'WBBUSTIME', lat: 22.3500, lon: 87.9200, district: 'Purba Medinipur', block: 'Kolaghat' },
  { name: 'Haldia Bus Stand', normalizedName: 'haldia bus stand', providerCode: 'WBBUS', lat: 22.0667, lon: 88.0667, district: 'Purba Medinipur', block: 'Haldia' },
  { name: 'Durgachak Bus Stop', normalizedName: 'durgachak bus stop', providerCode: 'WBBUS', lat: 22.0800, lon: 88.0750, district: 'Purba Medinipur', block: 'Haldia' },

  // Kolkata & Suburban Terminals
  { name: 'Sealdah Railway Station', normalizedName: 'sealdah railway station', providerCode: 'OPENSTREETMAP', lat: 22.5644, lon: 88.3711, district: 'Kolkata', block: 'Sealdah' },
  { name: 'Howrah Bus Terminus', normalizedName: 'howrah bus terminus', providerCode: 'WBBUS', lat: 22.5853, lon: 88.3426, district: 'Howrah', block: 'Howrah' },
  { name: 'Karunamoyee Salt Lake', normalizedName: 'karunamoyee salt lake', providerCode: 'WBBUS', lat: 22.5867, lon: 88.4172, district: 'North 24 Parganas', block: 'Bidhannagar' },

  // Nadia, Paschim Bardhaman, Jhargram, Bankura
  { name: 'Kalyani Station Bus Terminus', normalizedName: 'kalyani station bus terminus', providerCode: 'WBBUSTIME', lat: 22.9750, lon: 88.4344, district: 'Nadia', block: 'Kalyani' },
  { name: 'Durgapur City Center Bus Stand', normalizedName: 'durgapur city center bus stand', providerCode: 'WBBUSTIME', lat: 23.5204, lon: 87.3119, district: 'Paschim Bardhaman', block: 'Durgapur' },
  { name: 'Raniganj Bus Stop', normalizedName: 'raniganj bus stop', providerCode: 'WBBUSTIME', lat: 23.6225, lon: 87.1333, district: 'Paschim Bardhaman', block: 'Raniganj' },
  { name: 'Asansol Bus Terminus', normalizedName: 'asansol bus terminus', providerCode: 'WBBUSTIME', lat: 23.6889, lon: 86.9661, district: 'Paschim Bardhaman', block: 'Asansol' },
  { name: 'Jhargram Bus Stand', normalizedName: 'jhargram bus stand', providerCode: 'WBBUS', lat: 22.4542, lon: 86.9839, district: 'Jhargram', block: 'Jhargram' },
  { name: 'Khatra Bus Stand', normalizedName: 'khatra bus stand', providerCode: 'WBBUS', lat: 22.9804, lon: 86.8528, district: 'Bankura', block: 'Khatra' },
  { name: 'Gopiballabpur Bus Stand', normalizedName: 'gopiballabpur bus stand', providerCode: 'WBBUS', lat: 22.2133, lon: 86.9011, district: 'Jhargram', block: 'Gopiballabpur' },
];

async function main() {
  console.log('==================================================');
  console.log('INGESTING REAL WEST BENGAL VILLAGES & BUS STOPS');
  console.log('==================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const sequelize = app.get(Sequelize);
  const datasetVersionId = ensureUuidV7();

  console.log(`Dataset Version ID: ${datasetVersionId}`);

  let insertedCount = 0;
  for (const node of wbNodes) {
    const existing = await BusStopModel.findOne({
      where: { normalizedName: node.normalizedName, providerCode: node.providerCode },
    });

    if (existing) {
      await existing.update({
        name: node.name,
        metadata: {
          latitude: node.lat,
          longitude: node.lon,
          district: node.district,
          block: node.block,
          gramPanchayat: node.gp,
        },
      });
    } else {
      await BusStopModel.create({
        id: ensureUuidV7(),
        providerCode: node.providerCode,
        externalId: ensureUuidV7(),
        name: node.name,
        normalizedName: node.normalizedName,
        datasetVersionId,
        metadata: {
          latitude: node.lat,
          longitude: node.lon,
          district: node.district,
          block: node.block,
          gramPanchayat: node.gp,
        },
      });
      insertedCount++;
    }
  }

  console.log(`✅ Ingested ${insertedCount} new West Bengal villages and transport stops into PostgreSQL.`);

  // Show summary count of West Bengal spatial stops
  const countRes: any = await sequelize.query(
    `SELECT COUNT(*) as count FROM "bus_stops"
     WHERE CAST("metadata"->>'latitude' AS FLOAT) BETWEEN 21.5 AND 27.5
       AND CAST("metadata"->>'longitude' AS FLOAT) BETWEEN 85.8 AND 89.9;`,
    { type: QueryTypes.SELECT }
  );

  console.log(`Current Total West Bengal Stops in Database: ${countRes[0]?.count}\n`);

  await app.close();
}

main().catch(console.error);
