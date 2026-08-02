import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PluggableGeocoderEngine } from '../modules/provider-ingestion/geocoding/pluggable-geocoder.engine';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';

const WB_PROVIDERS = [
  'WBBUS', 'WBBUSTIME', 'BUSSATHI', 'WBTC', 'SBSTC', 'NBSTC',
  'EASTERN_RAILWAY_SUBURBAN', 'WB_FERRY', 'KOLKATA_TRAM', 'KOLKATA_METRO',
  'OPENSTREETMAP', 'NOMINATIM', 'CENSUS_INDIA',
];

async function main() {
  console.log('==================================================');
  console.log('BATCH GEOCODING: West Bengal Stops via Nominatim');
  console.log('==================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const geocoder = app.get(PluggableGeocoderEngine);
  const seq = app.get(Sequelize);

  // Fetch all WB stops missing coordinates
  const unlocated: Array<{ id: string; name: string; providerCode: string; metadata: any }> = await seq.query(
    `SELECT "id", "name", "providerCode", "metadata"
     FROM "bus_stops"
     WHERE "providerCode" IN (:providers)
       AND (
         "metadata"->>'latitude' IS NULL
         OR CAST("metadata"->>'latitude' AS FLOAT) = 0
         OR CAST("metadata"->>'latitude' AS FLOAT) NOT BETWEEN 21.5 AND 27.5
       )
       AND (
         "metadata"->>'lifecycleStatus' IS NULL
         OR "metadata"->>'lifecycleStatus' NOT IN ('MERGED', 'DEPRECATED')
       )
     ORDER BY "providerCode", "name";`,
    { replacements: { providers: WB_PROVIDERS }, type: QueryTypes.SELECT }
  );

  console.log(`Found ${unlocated.length} unlocated WB stops to geocode.\n`);

  let enriched = 0;
  let dbMatches = 0;
  let nominatimMatches = 0;
  
  const failureStats: Record<string, number> = {
    'FAILURE_NO_NOMINATIM_RESULT': 0,
    'FAILURE_AMBIGUOUS': 0,
    'FAILURE_LOW_CONFIDENCE': 0,
    'FAILURE_MISSING_DISTRICT': 0,
    'FAILURE_PROVIDER_TYPO': 0,
    'FAILURE_NO_CANONICAL_MATCH': 0,
    'FAILURE_UNKNOWN': 0
  };

  const BATCH_SIZE = 100; // Process in batches, report progress

  for (let i = 0; i < unlocated.length; i++) {
    const stop = unlocated[i];

    // Skip if already has high-confidence coords (race condition protection)
    const existingConf = parseFloat(stop.metadata?.coordConfidence) || 0;
    if (existingConf >= 0.95) continue;

    const district = stop.metadata?.district || stop.metadata?.District;
    const block = stop.metadata?.block || stop.metadata?.Block;

    const result = await geocoder.geocode({
      placeName: stop.name,
      district: district,
      block: block,
      state: 'West Bengal',
      country: 'India',
    });

    if (result && !result.failed && result.latitude && result.longitude) {
      // Don't overwrite higher confidence with lower confidence
      if (result.confidence && result.confidence < existingConf) {
         // It's technically a failure because we couldn't improve it
         failureStats['FAILURE_LOW_CONFIDENCE']++;
         continue;
      }

      const updatedMeta = {
        ...(stop.metadata || {}),
        latitude: result.latitude,
        longitude: result.longitude,
        coordConfidence: result.confidence,
        enrichmentSource: result.source,
        enrichedAt: new Date().toISOString(),
        lastVerifiedAt: new Date().toISOString(),
      };

      await seq.query(
        `UPDATE "bus_stops" SET "metadata" = :meta WHERE "id" = :id;`,
        { replacements: { meta: JSON.stringify(updatedMeta), id: stop.id }, type: QueryTypes.UPDATE }
      );

      enriched++;
      if (result.source === 'EXISTING_DB') dbMatches++;
      if (result.source === 'NOMINATIM') nominatimMatches++;
    } else {
      const reason = result?.failureReason || 'FAILURE_UNKNOWN';
      failureStats[reason]++;
    }

    // Progress reporting every BATCH_SIZE stops
    if ((i + 1) % BATCH_SIZE === 0 || i === unlocated.length - 1) {
      const failedTotal = Object.values(failureStats).reduce((a, b) => a + b, 0);
      console.log(`Progress: ${i + 1}/${unlocated.length} | Enriched: ${enriched} (DB: ${dbMatches}, Nominatim: ${nominatimMatches}) | Failed: ${failedTotal}`);
    }
  }

  // Print final coverage
  console.log('\n--- FINAL COORDINATE COVERAGE ---');
  const coverageRes: any[] = await seq.query(
    `SELECT "providerCode",
            COUNT(*) as total,
            COUNT(CASE WHEN "metadata"->>'latitude' IS NOT NULL
                       AND CAST("metadata"->>'latitude' AS FLOAT) BETWEEN 21.5 AND 27.5 THEN 1 END) as with_coords
     FROM "bus_stops"
     WHERE "providerCode" IN (:providers)
     GROUP BY "providerCode"
     ORDER BY CAST(COUNT(*) AS INT) DESC;`,
    { replacements: { providers: WB_PROVIDERS }, type: QueryTypes.SELECT }
  );

  console.table(coverageRes.map((r) => ({
    provider: r.providerCode,
    total: r.total,
    withCoords: r.with_coords,
    pct: `${((parseInt(r.with_coords) / parseInt(r.total)) * 100).toFixed(1)}%`,
  })));

  console.log('\n--- FAILURE DIAGNOSTICS ---');
  console.table(
    Object.entries(failureStats)
      .filter(([_, count]) => count > 0)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
  );

  await app.close();
  console.log('\n=== BATCH GEOCODING COMPLETE ===');
}

main().catch(console.error);
