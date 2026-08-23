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

/**
 * Exported so a test can check these identifiers against the Sequelize models.
 * The timetable gate previously read `stop_times.departure_time`: wrong table,
 * and a column name Postgres folds to lower case and then cannot find.
 */
export const timetableCoverageSql = (providerList: string) => `
  SELECT COUNT(*) as total,
         COUNT(st."departureTime") as with_field
  FROM bus_stop_times st
  JOIN bus_trips t ON st."tripId" = t.id
  WHERE t."providerCode" IN (${providerList})`;

export const fareCoverageSql = (providerList: string) => `
  SELECT COUNT(*) as total,
         COUNT(COALESCE(metadata->>'fareINR', metadata->>'fare')) as with_field
  FROM bus_routes
  WHERE "providerCode" IN (${providerList})`;

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

    // 2. Duplicate stops: same normalized name twice under one provider.
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

    // 7. Timetable coverage.
    //
    // Counts the provider-ingestion staging table, as every other check here
    // does. `stop_times` is the canonical projection: it carries no
    // providerCode, so it can neither be filtered to West Bengal nor reflect
    // what is currently staged. Its columns are quoted camelCase — unquoted
    // `departure_time` folds to lower case and the query throws.
    const timetable = await this.coverage(
      'TIMETABLE_COVERAGE_LOW',
      timetableCoverageSql(providerListStr),
      failures,
      warnings,
    );
    const timetableTotal = timetable.total;
    const timetableWithDep = timetable.withField;
    const timetablePctStr = timetable.pct;

    // 8. Fare coverage. `estimate-route-fares` writes metadata.fareINR; `fare`
    // is the older key that script still counts as present when it skips a
    // route, so both mean "this route has a fare".
    const fare = await this.coverage(
      'FARE_COVERAGE_LOW',
      fareCoverageSql(providerListStr),
      failures,
      warnings,
    );
    const fareTotalRoutes = fare.total;
    const fareWithFare = fare.withField;
    const farePctStr = fare.pct;

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

  /**
   * Shared shape of the coverage gates: count rows, count those carrying the
   * field, warn under the threshold.
   *
   * A check that cannot run is recorded as an ERROR rather than skipped. Both
   * callers used to swallow their own query failure and report zero rows, which
   * the `total > 0` threshold then read as "nothing to warn about" — so a gate
   * querying a column that does not exist looked exactly like a clean dataset.
   */
  private async coverage(
    rule: string,
    sql: string,
    failures: DataQualityFailure[],
    warnings: DataQualityFailure[],
  ): Promise<{ total: number; withField: number; pct: string }> {
    try {
      const [row] = (await this.sequelize.query(sql, { type: 'SELECT' })) as Array<{
        total: string;
        with_field: string;
      }>;
      const total = parseInt(row?.total || '0', 10);
      const withField = parseInt(row?.with_field || '0', 10);
      const pct = total > 0 ? ((withField / total) * 100).toFixed(2) : '0.00';

      if (total > 0 && parseFloat(pct) < 10) {
        warnings.push({ rule, provider: 'ALL_WB', expected: '>= 10%', actual: `${pct}%`, severity: 'WARNING' });
      }
      return { total, withField, pct };
    } catch (error) {
      this.logger.error(`${rule} could not be evaluated: ${error instanceof Error ? error.message : error}`);
      failures.push({
        rule: `${rule}_CHECK_FAILED`,
        provider: 'ALL_WB',
        expected: 'check runs',
        actual: error instanceof Error ? error.message : String(error),
        severity: 'ERROR',
      });
      return { total: 0, withField: 0, pct: '0.00' };
    }
  }
}
