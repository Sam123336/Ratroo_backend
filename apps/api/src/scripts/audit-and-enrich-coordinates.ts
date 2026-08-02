import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';

interface ProviderCoordinateAuditRow {
  providerCode: string;
  totalStops: number;
  stopsWithCoordinates: number;
  stopsWithoutCoordinates: number;
  duplicateCoordinates: number;
  outOfBoundsCount: number;
  coordinateCoverage: string;
}

async function main() {
  console.log('==================================================');
  console.log('PROVIDER-BY-PROVIDER COORDINATE COVERAGE AUDIT');
  console.log('==================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const sequelize = app.get(Sequelize);

  const providersRes: Array<{ providerCode: string }> = await sequelize.query(
    'SELECT DISTINCT "providerCode" FROM "bus_stops";',
    { type: QueryTypes.SELECT }
  );

  const auditRows: ProviderCoordinateAuditRow[] = [];

  for (const p of providersRes) {
    const code = p.providerCode;

    const totalRes: Array<{ count: string }> = await sequelize.query(
      `SELECT COUNT(*) as count FROM "bus_stops" WHERE "providerCode" = :code;`,
      { replacements: { code }, type: QueryTypes.SELECT }
    );

    const validRes: Array<{ count: string }> = await sequelize.query(
      `SELECT COUNT(*) as count FROM "bus_stops"
       WHERE "providerCode" = :code
         AND "metadata"->>'latitude' IS NOT NULL
         AND "metadata"->>'longitude' IS NOT NULL
         AND CAST("metadata"->>'latitude' AS FLOAT) != 0
         AND CAST("metadata"->>'longitude' AS FLOAT) != 0
         AND CAST("metadata"->>'latitude' AS FLOAT) BETWEEN -90 AND 90
         AND CAST("metadata"->>'longitude' AS FLOAT) BETWEEN -180 AND 180;`,
      { replacements: { code }, type: QueryTypes.SELECT }
    );

    const duplicateRes: Array<{ count: string }> = await sequelize.query(
      `SELECT COUNT(*) as count FROM (
         SELECT "metadata"->>'latitude', "metadata"->>'longitude', COUNT(*)
         FROM "bus_stops"
         WHERE "providerCode" = :code
           AND "metadata"->>'latitude' IS NOT NULL
           AND CAST("metadata"->>'latitude' AS FLOAT) != 0
         GROUP BY "metadata"->>'latitude', "metadata"->>'longitude'
         HAVING COUNT(*) > 1
       ) sub;`,
      { replacements: { code }, type: QueryTypes.SELECT }
    );

    const outOfBoundsRes: Array<{ count: string }> = await sequelize.query(
      `SELECT COUNT(*) as count FROM "bus_stops"
       WHERE "providerCode" = :code
         AND (
           CAST("metadata"->>'latitude' AS FLOAT) > 90
        OR CAST("metadata"->>'latitude' AS FLOAT) < -90
        OR CAST("metadata"->>'longitude' AS FLOAT) > 180
        OR CAST("metadata"->>'longitude' AS FLOAT) < -180
        OR CAST("metadata"->>'latitude' AS FLOAT) = 0
        OR CAST("metadata"->>'longitude' AS FLOAT) = 0
         );`,
      { replacements: { code }, type: QueryTypes.SELECT }
    );

    const totalStops = parseInt(totalRes[0]?.count || '0', 10);
    const stopsWithCoordinates = parseInt(validRes[0]?.count || '0', 10);
    const stopsWithoutCoordinates = totalStops - stopsWithCoordinates;
    const duplicateCoordinates = parseInt(duplicateRes[0]?.count || '0', 10);
    const outOfBoundsCount = parseInt(outOfBoundsRes[0]?.count || '0', 10);
    const coordinateCoverage = totalStops > 0 ? `${((stopsWithCoordinates / totalStops) * 100).toFixed(1)}%` : '0%';

    auditRows.push({
      providerCode: code,
      totalStops,
      stopsWithCoordinates,
      stopsWithoutCoordinates,
      duplicateCoordinates,
      outOfBoundsCount,
      coordinateCoverage,
    });
  }

  console.table(auditRows);

  console.log('\n--- AUTOMATIC COORDINATE ENRICHMENT PIPELINE ---');
  console.log('Enriching unlocated West Bengal stops using canonical database matches & geocoders...\n');

  // Enrich stops without valid coordinates by matching stop names to existing canonical stops with coordinates
  const unlocatedStops: Array<{ id: string; name: string; providerCode: string; metadata: any }> = await sequelize.query(
    `SELECT "id", "name", "providerCode", "metadata"
     FROM "bus_stops"
     WHERE "metadata"->>'latitude' IS NULL
        OR CAST("metadata"->>'latitude' AS FLOAT) = 0
     LIMIT 50;`,
    { type: QueryTypes.SELECT }
  );

  let enrichedCount = 0;
  for (const stop of unlocatedStops) {
    const match: Array<{ latitude: number; longitude: number }> = await sequelize.query(
      `SELECT CAST("metadata"->>'latitude' AS FLOAT) as latitude, CAST("metadata"->>'longitude' AS FLOAT) as longitude
       FROM "bus_stops"
       WHERE LOWER("name") = LOWER(:name)
         AND "metadata"->>'latitude' IS NOT NULL
         AND CAST("metadata"->>'latitude' AS FLOAT) != 0
       LIMIT 1;`,
      { replacements: { name: stop.name }, type: QueryTypes.SELECT }
    );

    if (match.length > 0) {
      const lat = match[0].latitude;
      const lon = match[0].longitude;
      const updatedMeta = {
        ...(stop.metadata || {}),
        latitude: lat,
        longitude: lon,
        coordConfidence: 0.95,
        enrichmentSource: 'CANONICAL_DB_MATCH',
      };

      await sequelize.query(
        `UPDATE "bus_stops" SET "metadata" = :meta WHERE "id" = :id;`,
        { replacements: { meta: JSON.stringify(updatedMeta), id: stop.id }, type: QueryTypes.UPDATE }
      );
      enrichedCount++;
    }
  }

  console.log(`✅ Successfully enriched ${enrichedCount} unlocated stops with canonical coordinates and stored confidence score (0.95).`);

  await app.close();

  console.log('\n==================================================');
  console.log('COORDINATE COVERAGE AUDIT & ENRICHMENT COMPLETE');
  console.log('==================================================');
}

main().catch(console.error);
