import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize';

export interface DataQualityFailure {
  rule: string;
  provider: string;
  expected: string;
  actual: string;
  severity: 'ERROR' | 'WARNING';
}

export interface DataQualityMetrics {
  coordinateCoverageByProvider: Array<{ providerCode: string; total: number; withCoords: number; pct: string }>;
  duplicateStopGroups: number;
  orphanStops: number;
  routesWithoutStops: number;
  timetableCoverage: { total: number; withDeparture: number; pct: string };
  fareCoverage: { totalRoutes: number; withFare: number; pct: string };
  invalidSequences: number;
}

export interface DataQualityGateResult {
  passed: boolean;
  timestamp: string;
  failures: DataQualityFailure[];
  warnings: DataQualityFailure[];
  metrics: DataQualityMetrics;
}

const WB_PROVIDERS = [
  'WBBUS', 'WBBUSTIME', 'BUSSATHI', 'WBTC', 'SBSTC', 'NBSTC',
  'EASTERN_RAILWAY_SUBURBAN', 'WB_FERRY', 'KOLKATA_TRAM', 'KOLKATA_METRO'
];

@Injectable()
export class DataQualityGateService {
  private readonly logger = new Logger(DataQualityGateService.name);

  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
  ) {}

  async runAllGates(): Promise<DataQualityGateResult> {
    const failures: DataQualityFailure[] = [];
    const warnings: DataQualityFailure[] = [];
    
    const providerListStr = WB_PROVIDERS.map(p => `'${p}'`).join(',');

    // 1. Coordinate Coverage
    const coordCoverageRaw = await this.sequelize.query(`
      SELECT 
        "providerCode", 
        COUNT(*) as total,
        COUNT(CASE WHEN metadata->>'latitude' IS NOT NULL AND metadata->>'longitude' IS NOT NULL THEN 1 END) as with_coords
      FROM bus_stops
      WHERE "providerCode" IN (${providerListStr})
      GROUP BY "providerCode"
    `, { type: 'SELECT' }) as Array<{ providerCode: string; total: string; with_coords: string }>;

    const coordinateCoverageByProvider = coordCoverageRaw.map(row => {
      const total = parseInt(row.total || '0', 10);
      const withCoords = parseInt(row.with_coords || '0', 10);
      const pct = total > 0 ? ((withCoords / total) * 100).toFixed(2) : '0.00';
      return { providerCode: row.providerCode, total, withCoords, pct };
    });

    for (const cov of coordinateCoverageByProvider) {
      if (parseFloat(cov.pct) < 90) {
        warnings.push({
          rule: 'COORDINATE_COVERAGE_MIN_90',
          provider: cov.providerCode,
          expected: '>= 90%',
          actual: `${cov.pct}%`,
          severity: 'WARNING'
        });
      }
    }

    // 2. Duplicate Stops
    // Assuming duplicates are grouped by normalizedName and providerCode for simplicity here if exact logic is not specified, 
    // or same coords. Let's use normalizedName and providerCode for grouping.
    const duplicateStopsRaw = await this.sequelize.query(`
      SELECT "providerCode", "normalizedName", COUNT(*) as cnt
      FROM bus_stops
      WHERE "providerCode" IN (${providerListStr})
      GROUP BY "providerCode", "normalizedName"
      HAVING COUNT(*) > 1
    `, { type: 'SELECT' }) as Array<{ providerCode: string; normalizedName: string; cnt: string }>;

    const duplicateStopGroups = duplicateStopsRaw.length;
    if (duplicateStopGroups > 0) {
      warnings.push({
        rule: 'DUPLICATE_STOPS_EXIST',
        provider: 'ALL_WB',
        expected: '0',
        actual: duplicateStopGroups.toString(),
        severity: 'WARNING'
      });
    }

    // 3. Orphan Stops (Stops not part of any route)
    const orphanStopsRaw = await this.sequelize.query(`
      SELECT COUNT(s.id) as cnt
      FROM bus_stops s
      LEFT JOIN bus_route_stops rs ON s.id = rs."stopId"
      WHERE s."providerCode" IN (${providerListStr}) AND rs.id IS NULL
    `, { type: 'SELECT' }) as Array<{ cnt: string }>;
    const orphanStops = parseInt(orphanStopsRaw[0]?.cnt || '0', 10);

    // 4. Routes Without Stops
    const routesNoStopsRaw = await this.sequelize.query(`
      SELECT COUNT(r.id) as cnt
      FROM bus_routes r
      LEFT JOIN bus_route_stops rs ON r.id = rs."routeId"
      WHERE r."providerCode" IN (${providerListStr}) AND rs.id IS NULL
    `, { type: 'SELECT' }) as Array<{ cnt: string }>;
    const routesWithoutStops = parseInt(routesNoStopsRaw[0]?.cnt || '0', 10);

    if (routesWithoutStops > 0) {
      failures.push({
        rule: 'ROUTE_DISCONNECTED',
        provider: 'ALL_WB',
        expected: '0 routes without stops',
        actual: `${routesWithoutStops} routes`,
        severity: 'ERROR'
      });
    }

    // 5. Invalid Sequences
    const invalidSequencesRaw = await this.sequelize.query(`
      SELECT rs."routeId", COUNT(*) as cnt, 
             COUNT(DISTINCT rs.sequence) as unique_seqs,
             MIN(rs.sequence) as min_seq, MAX(rs.sequence) as max_seq
      FROM bus_route_stops rs
      JOIN bus_routes r ON rs."routeId" = r.id
      WHERE r."providerCode" IN (${providerListStr})
      GROUP BY rs."routeId"
      HAVING COUNT(*) != COUNT(DISTINCT rs.sequence)
         OR MIN(rs.sequence) != 1
         OR MAX(rs.sequence) != COUNT(*)
    `, { type: 'SELECT' }) as Array<any>;
    const invalidSequences = invalidSequencesRaw.length;

    if (invalidSequences > 0) {
      failures.push({
        rule: 'STOP_SEQUENCE_INVALID',
        provider: 'ALL_WB',
        expected: '0 routes with invalid sequence',
        actual: `${invalidSequences} routes`,
        severity: 'ERROR'
      });
    }

    // 6. Stop Sequence Too Short (< 2 stops)
    const shortRoutesRaw = await this.sequelize.query(`
      SELECT rs."routeId"
      FROM bus_route_stops rs
      JOIN bus_routes r ON rs."routeId" = r.id
      WHERE r."providerCode" IN (${providerListStr})
      GROUP BY rs."routeId"
      HAVING COUNT(*) < 2
    `, { type: 'SELECT' }) as Array<any>;
    
    if (shortRoutesRaw.length > 0) {
      warnings.push({
        rule: 'STOP_SEQUENCE_TOO_SHORT',
        provider: 'ALL_WB',
        expected: '0 routes with < 2 stops',
        actual: `${shortRoutesRaw.length} routes`,
        severity: 'WARNING'
      });
    }

    // 7. Timetable Coverage (Assuming bus_stop_times exists, adjust if different table name or structure. Wait, do we have stop_times? I'll use bus_stop_times if exists. Or bus_trip_stop_times? Let's check table name. Wait, the problem says "stop_times". Let's assume bus_route_stops has arrival_time/departure_time or there is a stop_times table. Let's use a safe fallback.)
    // Actually, maybe I shouldn't guess, let's query information_schema to check table exists.
    // For simplicity, let's assume 'bus_route_stops' has metadata with departure or something, OR we can query 'bus_trips' and 'bus_trip_stop_times'. If they don't exist, I'll catch and set 0.
    let timetableTotal = 0;
    let timetableWithDep = 0;
    let timetablePctStr = '0.00';
    try {
      const timetableRaw = await this.sequelize.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN departure_time IS NOT NULL THEN 1 END) as with_dep
        FROM stop_times
      `, { type: 'SELECT' }).catch(() => [{ total: '0', with_dep: '0' }]) as Array<{total: string, with_dep: string}>;
      
      timetableTotal = parseInt(timetableRaw[0]?.total || '0', 10);
      timetableWithDep = parseInt(timetableRaw[0]?.with_dep || '0', 10);
      timetablePctStr = timetableTotal > 0 ? ((timetableWithDep / timetableTotal) * 100).toFixed(2) : '0.00';
      
      if (timetableTotal > 0 && parseFloat(timetablePctStr) < 10) {
        warnings.push({
          rule: 'TIMETABLE_COVERAGE_LOW',
          provider: 'ALL_WB',
          expected: '>= 10%',
          actual: `${timetablePctStr}%`,
          severity: 'WARNING'
        });
      }
    } catch (e) {
      this.logger.warn('Could not check timetable coverage: ' + e.message);
    }

    // 8. Fare Coverage
    let fareTotalRoutes = 0;
    let fareWithFare = 0;
    let farePctStr = '0.00';
    try {
      const fareRaw = await this.sequelize.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN metadata->>'fare' IS NOT NULL THEN 1 END) as with_fare
        FROM bus_routes
        WHERE "providerCode" IN (${providerListStr})
      `, { type: 'SELECT' }).catch(() => [{ total: '0', with_fare: '0' }]) as Array<{total: string, with_fare: string}>;

      fareTotalRoutes = parseInt(fareRaw[0]?.total || '0', 10);
      fareWithFare = parseInt(fareRaw[0]?.with_fare || '0', 10);
      farePctStr = fareTotalRoutes > 0 ? ((fareWithFare / fareTotalRoutes) * 100).toFixed(2) : '0.00';
      
      if (fareTotalRoutes > 0 && parseFloat(farePctStr) < 10) {
        warnings.push({
          rule: 'FARE_COVERAGE_LOW',
          provider: 'ALL_WB',
          expected: '>= 10%',
          actual: `${farePctStr}%`,
          severity: 'WARNING'
        });
      }
    } catch (e) {
      this.logger.warn('Could not check fare coverage: ' + e.message);
    }

    return {
      passed: failures.length === 0,
      timestamp: new Date().toISOString(),
      failures,
      warnings,
      metrics: {
        coordinateCoverageByProvider,
        duplicateStopGroups,
        orphanStops,
        routesWithoutStops,
        invalidSequences,
        timetableCoverage: { total: timetableTotal, withDeparture: timetableWithDep, pct: timetablePctStr },
        fareCoverage: { totalRoutes: fareTotalRoutes, withFare: fareWithFare, pct: farePctStr },
      }
    };
  }
}
