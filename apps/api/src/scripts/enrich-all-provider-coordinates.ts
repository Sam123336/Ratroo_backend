import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';

async function main() {
  console.log('==================================================');
  console.log('BATCH COORDINATE ENRICHMENT PIPELINE FOR WEST BENGAL');
  console.log('==================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const sequelize = app.get(Sequelize);

  // Fetch unlocated stops from West Bengal providers
  const unlocatedStops: Array<{ id: string; name: string; providerCode: string; metadata: any }> = await sequelize.query(
    `SELECT "id", "name", "providerCode", "metadata"
     FROM "bus_stops"
     WHERE "providerCode" IN ('WBBUS', 'WBTC', 'SBSTC', 'NBSTC', 'EASTERN_RAILWAY_SUBURBAN', 'WB_FERRY', 'KOLKATA_TRAM')
       AND ("metadata"->>'latitude' IS NULL OR CAST("metadata"->>'latitude' AS FLOAT) = 0)
     LIMIT 100;`,
    { type: QueryTypes.SELECT }
  );

  console.log(`Found ${unlocatedStops.length} unlocated West Bengal stops to enrich...\n`);

  let enrichedCount = 0;
  for (const stop of unlocatedStops) {
    const cleanName = stop.name.replace(/bus stop|bus stand|terminus|station/gi, '').trim();

    // 1. Check existing canonical stops with coordinates in DB
    const dbMatch: Array<{ latitude: number; longitude: number }> = await sequelize.query(
      `SELECT CAST("metadata"->>'latitude' AS FLOAT) as latitude, CAST("metadata"->>'longitude' AS FLOAT) as longitude
       FROM "bus_stops"
       WHERE LOWER("name") LIKE :query
         AND "metadata"->>'latitude' IS NOT NULL
         AND CAST("metadata"->>'latitude' AS FLOAT) BETWEEN 21.5 AND 27.5
       LIMIT 1;`,
      { replacements: { query: `%${cleanName.toLowerCase()}%` }, type: QueryTypes.SELECT }
    );

    if (dbMatch.length > 0) {
      const updatedMeta = {
        ...(stop.metadata || {}),
        latitude: dbMatch[0].latitude,
        longitude: dbMatch[0].longitude,
        coordConfidence: 0.92,
        enrichmentSource: 'CANONICAL_DB_MATCH',
      };

      await sequelize.query(
        `UPDATE "bus_stops" SET "metadata" = :meta WHERE "id" = :id;`,
        { replacements: { meta: JSON.stringify(updatedMeta), id: stop.id }, type: QueryTypes.UPDATE }
      );
      enrichedCount++;
    }
  }

  console.log(`✅ Successfully enriched ${enrichedCount} West Bengal provider stops with valid lat/lon coordinates & stored confidence (0.92).`);

  // Print updated provider coordinate audit
  const updatedAudit: Array<{ providerCode: string; total: string; withCoords: string }> = await sequelize.query(
    `SELECT "providerCode", COUNT(*) as total,
            COUNT(CASE WHEN "metadata"->>'latitude' IS NOT NULL AND CAST("metadata"->>'latitude' AS FLOAT) != 0 THEN 1 END) as withCoords
     FROM "bus_stops"
     WHERE "providerCode" IN ('WBBUS', 'WBTC', 'SBSTC', 'NBSTC', 'EASTERN_RAILWAY_SUBURBAN', 'WB_FERRY', 'KOLKATA_TRAM', 'WBBUSTIME', 'CENSUS_INDIA', 'OPENSTREETMAP', 'NOMINATIM')
     GROUP BY "providerCode";`,
    { type: QueryTypes.SELECT }
  );

  console.log('\n--- UPDATED PROVIDER COORDINATE TELEMETRY ---');
  console.table(updatedAudit);

  await app.close();
}

main().catch(console.error);
