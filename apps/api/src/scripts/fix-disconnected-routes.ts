import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';
import { ensureUuidV7 } from '../shared/ids/uuid-v7';

async function main() {
  console.log('=== FIXING DISCONNECTED ROUTES: Creating stop sequences ===\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const seq = app.get(Sequelize);

  // Find WB routes with 0 stops
  const disconnected: any[] = await seq.query(
    `SELECT r.id, r."providerCode", r."longName", r."datasetVersionId"
     FROM bus_routes r
     LEFT JOIN bus_route_stops rs ON rs."routeId" = r.id
     WHERE r."providerCode" IN ('WBBUS','WBBUSTIME','BUSSATHI','WBTC','SBSTC','NBSTC','EASTERN_RAILWAY_SUBURBAN','WB_FERRY','KOLKATA_TRAM','KOLKATA_METRO')
     GROUP BY r.id, r."providerCode", r."longName", r."datasetVersionId"
     HAVING COUNT(rs.id) = 0;`,
    { type: QueryTypes.SELECT }
  );

  console.log(`Found ${disconnected.length} disconnected routes.\n`);

  let routesFixed = 0;
  let stopsCreated = 0;
  let routeStopsCreated = 0;

  for (const route of disconnected) {
    // Parse origin and destination from longName
    // Formats: "X to Y", "X - Y", "X to Y via Z"
    const longName: string = route.longName;
    let parts: string[] = [];

    if (longName.includes(' to ')) {
      parts = longName.split(' to ').map(s => s.trim());
    } else if (longName.includes(' - ')) {
      parts = longName.split(' - ').map(s => s.trim());
    }

    if (parts.length < 2) {
      console.log(`  SKIP: Cannot parse "${longName}"`);
      continue;
    }

    // Handle "via" in destination: "Salt Lake Karunamoyee" from "Durgapur City Center to Salt Lake Karunamoyee"
    const origin = parts[0].replace(/\s*\(.*?\)\s*/g, '').trim();
    const destRaw = parts[parts.length - 1];
    const destination = destRaw.replace(/\s*\(.*?\)\s*/g, '').replace(/\s*Suburban Railway\s*/gi, '').trim();

    const stopNames = [origin, destination];

    // For each stop name: find existing stop or create new one
    const stopIds: string[] = [];
    for (const stopName of stopNames) {
      // Try to find existing stop with matching name
      const existing: any[] = await seq.query(
        `SELECT id FROM bus_stops WHERE LOWER(name) = LOWER(:name) LIMIT 1;`,
        { replacements: { name: stopName }, type: QueryTypes.SELECT }
      );

      if (existing.length > 0) {
        stopIds.push(existing[0].id);
      } else {
        // Create new stop
        const stopId = ensureUuidV7();
        const normalizedName = stopName.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        await seq.query(
          `INSERT INTO bus_stops (id, "providerCode", "externalId", name, "normalizedName", "datasetVersionId", metadata, "createdAt", "updatedAt")
           VALUES (:id, :pCode, :extId, :name, :normName, :dvId, :meta, NOW(), NOW())
           ON CONFLICT DO NOTHING;`,
          {
            replacements: {
              id: stopId,
              pCode: route.providerCode,
              extId: `stop_${normalizedName.replace(/\s+/g, '_')}`,
              name: stopName,
              normName: normalizedName,
              dvId: route.datasetVersionId,
              meta: JSON.stringify({ lifecycleStatus: 'ACTIVE', createdBy: 'route_repair_script' }),
            },
            type: QueryTypes.INSERT,
          }
        );
        stopIds.push(stopId);
        stopsCreated++;
      }
    }

    // Create bus_route_stops entries
    for (let i = 0; i < stopIds.length; i++) {
      const rsId = ensureUuidV7();
      await seq.query(
        `INSERT INTO bus_route_stops (id, "routeId", "stopId", sequence, "datasetVersionId", "createdAt", "updatedAt")
         VALUES (:id, :routeId, :stopId, :seq, :dvId, NOW(), NOW())
         ON CONFLICT DO NOTHING;`,
        {
          replacements: {
            id: rsId,
            routeId: route.id,
            stopId: stopIds[i],
            seq: i + 1,
            dvId: route.datasetVersionId,
          },
          type: QueryTypes.INSERT,
        }
      );
      routeStopsCreated++;
    }

    routesFixed++;
    console.log(`  ✅ Fixed: ${longName} (${stopIds.length} stops linked)`);
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`Routes fixed: ${routesFixed}`);
  console.log(`New stops created: ${stopsCreated}`);
  console.log(`Route-stop links created: ${routeStopsCreated}`);

  await app.close();
}

main().catch(console.error);
