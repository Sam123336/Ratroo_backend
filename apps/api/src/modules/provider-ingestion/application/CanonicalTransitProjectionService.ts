import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { QueryTypes, Sequelize } from 'sequelize';

/**
 * Projects the promoted provider-ingestion network (`bus_*`) into the canonical
 * transit serving tables (`agencies`, `stops`, `routes`, `trips`, `stop_times`)
 * that the public /v1 endpoints and the mobile app read.
 *
 * Ingestion promotes into `bus_*`; nothing filled the transit tables, so
 * /v1/routes, /v1/stops/nearby and /v1/journey were all served from empty
 * tables while the data sat one schema over. This is the missing publish step.
 *
 * Set-based SQL rather than the ORM: ~40k rows, and row-by-row would take
 * minutes and a lot of memory for what Postgres does in one pass.
 *
 * Idempotent — every statement is an upsert, so re-running after each nightly
 * sync converges rather than duplicating.
 *
 * Row ids are carried across unchanged (routes.id = bus_routes.id, and so on),
 * which is what lets the foreign keys line up without an id translation table.
 */
@Injectable()
export class CanonicalTransitProjectionService {
  private readonly logger = new Logger(CanonicalTransitProjectionService.name);

  constructor(@InjectConnection() private readonly sequelize: Sequelize) {}

  async project(): Promise<Record<string, number>> {
    const startedAt = Date.now();

    const counts = await this.sequelize.transaction(async transaction => {
      const run = async (label: string, sql: string) => {
        await this.sequelize.query(sql, { transaction, type: QueryTypes.RAW });
        this.logger.log(`projected ${label}`);
      };

      // One agency per provider code. bus_routes has no agency concept, so the
      // provider stands in as the operator.
      await run(
        'agencies',
        `
        INSERT INTO agencies (id, name, code, country, provider, "createdAt", "updatedAt")
        SELECT gen_random_uuid(), r."providerCode", r."providerCode", 'IN', r."providerCode", now(), now()
        FROM (SELECT DISTINCT "providerCode" FROM bus_routes) r
        ON CONFLICT (code) DO UPDATE SET "updatedAt" = now()
        `,
      );

      // lat/lng live inside the metadata JSON on bus_stops.
      await run(
        'stops',
        `
        INSERT INTO stops (id, name, "normalizedName", latitude, longitude, location,
                           city, district, state, provider, "externalId", "createdAt", "updatedAt")
        SELECT
          bs.id,
          LEFT(bs.name, 255),
          LEFT(bs."normalizedName", 255),
          (bs.metadata->>'latitude')::numeric,
          (bs.metadata->>'longitude')::numeric,
          CASE
            WHEN bs.metadata->>'longitude' IS NOT NULL AND bs.metadata->>'latitude' IS NOT NULL
            THEN ST_SetSRID(ST_MakePoint((bs.metadata->>'longitude')::float8,
                                         (bs.metadata->>'latitude')::float8), 4326)
          END,
          bs.metadata->'geography'->>'city',
          bs.metadata->'geography'->>'district',
          bs.metadata->'geography'->>'stateCode',
          bs."providerCode",
          bs."externalId",
          now(), now()
        FROM bus_stops bs
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          "normalizedName" = EXCLUDED."normalizedName",
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          location = EXCLUDED.location,
          city = EXCLUDED.city,
          district = EXCLUDED.district,
          state = EXCLUDED.state,
          "updatedAt" = now()
        `,
      );

      // origin/destination come from the first and last stop of the route's
      // stop sequence; a route with no stops still projects, just without them.
      await run(
        'routes',
        `
        INSERT INTO routes (id, "agencyId", "shortName", "longName", "originStopId",
                            "destinationStopId", "routeType", provider, "externalId",
                            "createdAt", "updatedAt")
        SELECT
          br.id,
          a.id,
          LEFT(br.metadata->>'shortName', 255),
          LEFT(br."longName", 255),
          origin."stopId",
          dest."stopId",
          -- Mode from the operator. Everything was hardcoded 'BUS', which is why
          -- Kolkata's 7 tram routes and 11 ferry routes were indistinguishable
          -- from buses and the Ferry/Train/Metro screens had nothing to show.
          CASE br."providerCode"
            WHEN 'KOLKATA_TRAM' THEN 'TRAM'
            WHEN 'WB_FERRY' THEN 'FERRY'
            WHEN 'EASTERN_RAILWAY_SUBURBAN' THEN 'RAIL'
            WHEN 'KOLKATA_METRO' THEN 'METRO'
            WHEN 'BMRCL' THEN 'METRO'
            ELSE 'BUS'
          END,
          br."providerCode",
          br."externalId",
          now(), now()
        FROM bus_routes br
        JOIN agencies a ON a.code = br."providerCode"
        LEFT JOIN LATERAL (
          SELECT brs."stopId" FROM bus_route_stops brs
          WHERE brs."routeId" = br.id ORDER BY brs.sequence ASC LIMIT 1
        ) origin ON true
        LEFT JOIN LATERAL (
          SELECT brs."stopId" FROM bus_route_stops brs
          WHERE brs."routeId" = br.id ORDER BY brs.sequence DESC LIMIT 1
        ) dest ON true
        ON CONFLICT (id) DO UPDATE SET
          "agencyId" = EXCLUDED."agencyId",
          "shortName" = EXCLUDED."shortName",
          "longName" = EXCLUDED."longName",
          "originStopId" = EXCLUDED."originStopId",
          "destinationStopId" = EXCLUDED."destinationStopId",
          "routeType" = EXCLUDED."routeType",
          "updatedAt" = now()
        `,
      );

      // Only trips whose route projected — an orphan trip would break the FK.
      await run(
        'trips',
        `
        INSERT INTO trips (id, "routeId", direction, "vehicleName", "vehicleRegistration",
                           provider, "externalId", "createdAt", "updatedAt")
        SELECT
          bt.id,
          bt."routeId",
          COALESCE(bt.direction, 'OUTBOUND'),
          bt."vehicleName",
          bt."vehicleRegistration",
          bt."providerCode",
          bt."externalId",
          now(), now()
        FROM bus_trips bt
        JOIN routes r ON r.id = bt."routeId"
        ON CONFLICT (id) DO UPDATE SET
          "routeId" = EXCLUDED."routeId",
          direction = EXCLUDED.direction,
          "vehicleName" = EXCLUDED."vehicleName",
          "updatedAt" = now()
        `,
      );

      await run(
        'stop_times',
        `
        INSERT INTO stop_times (id, "tripId", "stopId", "stopSequence", "arrivalTime", "departureTime", "timeSource")
        SELECT bst.id, bst."tripId", bst."stopId", bst.sequence, bst."arrivalTime", bst."departureTime", bst."timeSource"
        FROM bus_stop_times bst
        JOIN trips t ON t.id = bst."tripId"
        JOIN stops s ON s.id = bst."stopId"
        ON CONFLICT (id) DO UPDATE SET
          "stopSequence" = EXCLUDED."stopSequence",
          "arrivalTime" = EXCLUDED."arrivalTime",
          "departureTime" = EXCLUDED."departureTime",
          -- Carry the provenance through, or estimates arrive indistinguishable
          -- from scraped operator times.
          "timeSource" = EXCLUDED."timeSource"
        `,
      );

      return this.countAll(transaction);
    });

    this.logger.log(
      `Canonical projection finished in ${Math.round((Date.now() - startedAt) / 1000)}s: ` +
        Object.entries(counts).map(([table, n]) => `${table}=${n}`).join(' '),
    );

    return counts;
  }

  private async countAll(transaction?: unknown): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};

    for (const table of ['agencies', 'stops', 'routes', 'trips', 'stop_times']) {
      const [row] = await this.sequelize.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${table}`,
        { type: QueryTypes.SELECT, transaction: transaction as never },
      );
      counts[table] = row.n;
    }

    return counts;
  }
}
