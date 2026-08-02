import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';

// Haversine distance in km
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const BASE_FARE = 10; // Minimum fare in INR
const RATE_PER_KM = 1.5; // Estimated per-km fare in INR

const WB_PROVIDERS = [
  'WBBUS', 'WBBUSTIME', 'BUSSATHI', 'WBTC', 'SBSTC', 'NBSTC',
  'EASTERN_RAILWAY_SUBURBAN', 'WB_FERRY', 'KOLKATA_TRAM', 'KOLKATA_METRO'
];

async function main() {
  console.log('==================================================');
  console.log('ESTIMATING FARES FOR ALL WB ROUTES');
  console.log('==================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const seq = app.get(Sequelize);

  // Fetch all WB routes
  const routes: any[] = await seq.query(
    `SELECT r.id, r."providerCode", r.metadata, r."longName"
     FROM bus_routes r
     WHERE r."providerCode" IN (:providers);`,
    { replacements: { providers: WB_PROVIDERS }, type: QueryTypes.SELECT }
  );

  console.log(`Found ${routes.length} WB routes to estimate fares for.\n`);

  let updatedCount = 0;

  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];

    // Check if fare already exists
    if (route.metadata && (route.metadata.fareINR || route.metadata.fare)) {
      continue;
    }

    // Fetch ordered stops with coordinates for this route
    const stops: any[] = await seq.query(
      `SELECT rs.sequence, s.metadata->>'latitude' as lat, s.metadata->>'longitude' as lon
       FROM bus_route_stops rs
       JOIN bus_stops s ON s.id = rs."stopId"
       WHERE rs."routeId" = :routeId
       ORDER BY rs.sequence ASC;`,
      { replacements: { routeId: route.id }, type: QueryTypes.SELECT }
    );

    if (stops.length < 2) continue;

    let totalDistanceKm = 0;
    let validSegments = 0;

    for (let j = 0; j < stops.length - 1; j++) {
      const p1 = stops[j];
      const p2 = stops[j + 1];

      if (p1.lat && p1.lon && p2.lat && p2.lon) {
        const lat1 = parseFloat(p1.lat);
        const lon1 = parseFloat(p1.lon);
        const lat2 = parseFloat(p2.lat);
        const lon2 = parseFloat(p2.lon);

        if (!Number.isNaN(lat1) && !Number.isNaN(lat2)) {
          totalDistanceKm += getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2);
          validSegments++;
        }
      }
    }

    // If we have at least 1 valid segment, we estimate
    if (validSegments > 0) {
      // Scale up distance if we have missing segments
      const scaleFactor = (stops.length - 1) / validSegments;
      const estimatedTotalDistance = totalDistanceKm * scaleFactor;

      const estimatedFare = Math.max(BASE_FARE, Math.round(estimatedTotalDistance * RATE_PER_KM));

      const updatedMeta = {
        ...(route.metadata || {}),
        fareINR: estimatedFare,
        estimatedDistanceKm: Math.round(estimatedTotalDistance * 10) / 10,
        fareSource: 'ESTIMATED_BY_DISTANCE',
        fareCalculatedAt: new Date().toISOString()
      };

      await seq.query(
        `UPDATE "bus_routes" SET "metadata" = :meta WHERE "id" = :id;`,
        { replacements: { meta: JSON.stringify(updatedMeta), id: route.id }, type: QueryTypes.UPDATE }
      );

      updatedCount++;
    }
  }

  console.log(`\nEstimated fares for ${updatedCount} routes.`);

  // Print final fare coverage
  const coverageRes: any[] = await seq.query(
    `SELECT "providerCode",
            COUNT(*) as total,
            COUNT(CASE WHEN "metadata"->>'fareINR' IS NOT NULL THEN 1 END) as with_fare
     FROM "bus_routes"
     WHERE "providerCode" IN (:providers)
     GROUP BY "providerCode"
     ORDER BY CAST(COUNT(*) AS INT) DESC;`,
    { replacements: { providers: WB_PROVIDERS }, type: QueryTypes.SELECT }
  );

  console.log('\n--- FINAL FARE COVERAGE ---');
  console.table(coverageRes.map((r) => ({
    provider: r.providerCode,
    total: r.total,
    withFare: r.with_fare,
    pct: `${((parseInt(r.with_fare) / parseInt(r.total)) * 100).toFixed(1)}%`,
  })));

  await app.close();
  console.log('\n=== FARE ESTIMATION COMPLETE ===');
}

main().catch(console.error);
