import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';

async function audit() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const seq = app.get(Sequelize);

  // 1. Coordinate coverage per provider
  const coords: any[] = await seq.query(
    `SELECT "providerCode",
            COUNT(*) as total,
            COUNT(CASE WHEN "metadata"->>'latitude' IS NOT NULL AND CAST("metadata"->>'latitude' AS FLOAT) BETWEEN 21.5 AND 27.5 THEN 1 END) as with_coords
     FROM bus_stops
     GROUP BY "providerCode"
     ORDER BY CAST(COUNT(*) AS INT) DESC;`,
    { type: QueryTypes.SELECT }
  );
  console.log('=== COORDINATE COVERAGE PER PROVIDER ===');
  console.table(coords.map(r => ({
    provider: r.providerCode,
    total: r.total,
    withCoords: r.with_coords,
    pct: `${((parseInt(r.with_coords) / parseInt(r.total)) * 100).toFixed(1)}%`
  })));

  // 2. Routes with vs without stop sequences
  const seqs: any[] = await seq.query(
    `SELECT r."providerCode",
            COUNT(DISTINCT r.id) as total_routes,
            COUNT(DISTINCT rs."routeId") as routes_with_stops
     FROM bus_routes r
     LEFT JOIN bus_route_stops rs ON rs."routeId" = r.id
     GROUP BY r."providerCode"
     ORDER BY CAST(COUNT(DISTINCT r.id) AS INT) DESC;`,
    { type: QueryTypes.SELECT }
  );
  console.log('=== STOP SEQUENCE COVERAGE PER PROVIDER ===');
  console.table(seqs.map(r => ({
    provider: r.providerCode,
    totalRoutes: r.total_routes,
    routesWithStops: r.routes_with_stops,
    pct: `${((parseInt(r.routes_with_stops) / parseInt(r.total_routes)) * 100).toFixed(1)}%`
  })));

  // 3. Timetable coverage
  const times: any[] = await seq.query(
    `SELECT COUNT(*) as total_stop_times,
            COUNT(DISTINCT "tripId") as unique_trips,
            COUNT(CASE WHEN "departureTime" IS NOT NULL THEN 1 END) as with_departure
     FROM bus_stop_times;`,
    { type: QueryTypes.SELECT }
  );
  console.log('=== TIMETABLE COVERAGE ===');
  console.table(times);

  // 4. Fare coverage
  const fares: any[] = await seq.query(
    `SELECT COUNT(*) as total_routes,
            COUNT(CASE WHEN "metadata"->>'fareINR' IS NOT NULL THEN 1 END) as with_fare
     FROM bus_routes;`,
    { type: QueryTypes.SELECT }
  );
  console.log('=== FARE COVERAGE ===');
  console.table(fares);

  // 5. Duplicate stop name groups
  const dups: any[] = await seq.query(
    `SELECT COUNT(*) as dup_groups FROM (
       SELECT LOWER(name) FROM bus_stops GROUP BY LOWER(name) HAVING COUNT(*) > 1
     ) d;`,
    { type: QueryTypes.SELECT }
  );
  console.log('=== DUPLICATE STOP NAME GROUPS ===');
  console.table(dups);

  // 6. Total route-stop rows
  const rsRows: any[] = await seq.query(
    `SELECT COUNT(*) as total_rows FROM bus_route_stops;`,
    { type: QueryTypes.SELECT }
  );
  console.log('=== TOTAL ROUTE-STOP ROWS ===');
  console.table(rsRows);

  // 7. Orphan stops (not linked to any route)
  const orphans: any[] = await seq.query(
    `SELECT COUNT(*) as orphan_stops FROM bus_stops s
     WHERE NOT EXISTS (SELECT 1 FROM bus_route_stops rs WHERE rs."stopId" = s.id);`,
    { type: QueryTypes.SELECT }
  );
  console.log('=== ORPHAN STOPS (not linked to any route) ===');
  console.table(orphans);

  await app.close();
}

audit().catch(console.error);
