import { Injectable, NotFoundException } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { ApiResult } from '../../core/dto/api-response.dto';

export interface Departure {
  /** "HH:MM", local time. */
  time: string;
  routeId: string;
  routeName: string;
  /** Last stop on the trip — where this service is headed. */
  headsign: string | null;
  /** The name painted on the bus, e.g. "APANJAN". Null when unrecorded. */
  operator: string | null;
  /** Its registration, e.g. "WB67D5949". */
  vehicle: string | null;
  /** SCRAPED (from the operator) or INTERPOLATED (estimated between known times). */
  timeSource: string | null;
}

export interface PlaceDetailDto {
  id: string;
  title: string;
  category: string | null;
  latitude: number | null;
  longitude: number | null;
  confidence: number | null;
  verified: boolean;
  aliases: string[];
  /** Services calling at any stop mapped to this place. */
  routes: Array<{ id: string; name: string; providerCode: string }>;
  /**
   * The day's scheduled departures from this place, earliest first. Empty when
   * no timetable has been sourced for it — the client says so rather than
   * implying a stop is unserved.
   */
  departures: Departure[];
  stopCount: number;
  /** Operators behind this data. `website` is null until the providers table is seeded. */
  sources: Array<{ providerCode: string; name: string; website: string | null }>;
}

@Injectable()
export class PlacesService {
  constructor(private readonly sequelize: Sequelize) {}

  /**
   * Detail for one canonical place, including the services that call there.
   *
   * Previously a 501 stub, which is why the app's Place Details screen could
   * only ever say "No details found".
   */
  async findById(requestedId: string): Promise<ApiResult<PlaceDetailDto>> {
    // The app reaches this screen from two lists with different id spaces:
    // /v1/search returns place ids, /v1/stops/nearby returns stop ids. Accept
    // either rather than making the client know which it is holding.
    const id = await this.resolvePlaceId(requestedId);

    const [place] = await this.sequelize.query<{
      id: string; canonicalName: string; type: string | null;
      latitude: string | null; longitude: string | null;
      confidence: string | null; verified: boolean;
    }>(
      `SELECT id, "canonicalName", type, latitude, longitude, confidence, verified
       FROM places WHERE id = :id LIMIT 1`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );

    if (!place) {
      // A stop with no canonical place still has a name and coordinates, which
      // beats showing the user nothing.
      const fromStop = await this.stopAsPlace(requestedId);
      if (fromStop) return fromStop;

      throw new NotFoundException(`No place or stop found with id ${requestedId}.`);
    }

    const aliasRows = await this.sequelize.query<{ alias: string }>(
      `SELECT alias FROM place_aliases WHERE "placeId" = :id ORDER BY alias LIMIT 20`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );

    // Stops carry the placeId, and routes reach places through their stops.
    const routes = await this.sequelize.query<{ id: string; name: string; providerCode: string }>(
      `SELECT DISTINCT r.id, r."longName" AS name, r."providerCode"
       FROM bus_stops s
       JOIN bus_route_stops rs ON rs."stopId" = s.id
       JOIN bus_routes r ON r.id = rs."routeId"
       WHERE s."placeId" = :id
       ORDER BY r."longName"
       LIMIT 50`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );

    const stopRows = await this.sequelize.query<{ id: string }>(
      `SELECT id FROM bus_stops WHERE "placeId" = :id`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );

    const confidence = place.confidence === null ? null : Number(place.confidence);

    return new ApiResult(
      {
        id: place.id,
        title: place.canonicalName,
        category: (await this.categoryFor(stopRows.map(row => row.id))) ?? place.type,
        latitude: place.latitude === null ? null : Number(place.latitude),
        longitude: place.longitude === null ? null : Number(place.longitude),
        confidence,
        verified: Boolean(place.verified),
        aliases: aliasRows.map(row => row.alias),
        routes,
        departures: await this.departuresFor(stopRows.map(row => row.id)),
        stopCount: stopRows.length,
        sources: await this.sourcesFor(routes.map(r => r.providerCode)),
      },
      { confidenceScore: confidence ?? 1, providers: [...new Set(routes.map(r => r.providerCode))] },
    );
  }


  /**
   * The mode of the services calling at these stops, as `<routeType>_STOP`.
   *
   * The places table only stores the generic type "STOP", so the app was
   * showing a tram stop as a bus stop. /v1/stops/nearby already derives the
   * mode this way; this keeps the detail screen consistent with the list the
   * user tapped through from. Null when no route reaches these stops — better
   * than assuming a bus.
   */
  private async categoryFor(stopIds: string[]): Promise<string | null> {
    if (!stopIds.length) return null;

    const [row] = await this.sequelize.query<{ category: string }>(
      // The mode with the most services here, not whichever row came back
      // first: an interchange served by 40 buses and one tram is a bus stop.
      `SELECT r."routeType" || '_STOP' AS category
       FROM stop_times st
       JOIN trips t ON t.id = st."tripId"
       JOIN routes r ON r.id = t."routeId"
       WHERE st."stopId" IN (:stopIds)
       GROUP BY r."routeType"
       ORDER BY count(DISTINCT r.id) DESC, r."routeType"
       LIMIT 1`,
      { replacements: { stopIds }, type: QueryTypes.SELECT },
    );

    return row?.category ?? null;
  }

  /**
   * Scheduled departures from the given stops, earliest first.
   *
   * bus_stops and stops share ids, so the ids resolved for a place index
   * straight into stop_times. DISTINCT because a route running the same
   * timing in both directions stores one row per trip.
   */
  private async departuresFor(stopIds: string[]): Promise<Departure[]> {
    if (!stopIds.length) return [];

    return this.sequelize.query<Departure>(
      `SELECT DISTINCT
              st."departureTime" AS time,
              r.id AS "routeId",
              COALESCE(NULLIF(r."shortName", ''), r."longName") AS "routeName",
              st."timeSource" AS "timeSource",
              -- The name on the bus. For West Bengal's private operators this
              -- is how a rider identifies the service at the stand, far more
              -- than any route code.
              t."vehicleName" AS operator,
              t."vehicleRegistration" AS vehicle,
              last_stop.name AS headsign
       FROM stop_times st
       JOIN trips t ON t.id = st."tripId"
       JOIN routes r ON r.id = t."routeId"
       LEFT JOIN LATERAL (
         SELECT s2.name
         FROM stop_times st2
         JOIN stops s2 ON s2.id = st2."stopId"
         WHERE st2."tripId" = t.id
         ORDER BY st2."stopSequence" DESC
         LIMIT 1
       ) last_stop ON TRUE
       WHERE st."stopId" IN (:stopIds)
         AND st."departureTime" IS NOT NULL
       ORDER BY time
       LIMIT 800`,
      // ponytail: 800 is a backstop, not a page — the busiest place currently
      // has 571 departures. If a hub ever exceeds it the tail is dropped
      // silently; add a `from` time window before that becomes possible.
      { replacements: { stopIds }, type: QueryTypes.SELECT },
    );
  }

  /** Provider name/website from the registry table. Returns null websites when unseeded. */
  private async sourcesFor(providerCodes: string[]) {
    const codes = [...new Set(providerCodes)].filter(Boolean);
    if (!codes.length) return [];

    const rows = await this.sequelize.query<{ code: string; name: string; website: string | null }>(
      `SELECT code, name, website FROM providers WHERE code IN (:codes)`,
      { replacements: { codes }, type: QueryTypes.SELECT },
    );

    const byCode = new Map(rows.map(r => [r.code, r]));
    return codes.map(code => ({
      providerCode: code,
      name: byCode.get(code)?.name ?? code,
      website: byCode.get(code)?.website ?? null,
    }));
  }

  /** Returns the id unchanged if it is a place, or the stop's placeId if it is a stop. */
  private async resolvePlaceId(id: string): Promise<string> {
    const [stop] = await this.sequelize.query<{ placeId: string | null }>(
      `SELECT "placeId" FROM bus_stops WHERE id = :id LIMIT 1`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );

    return stop?.placeId ?? id;
  }

  /** Fallback detail built from a stop when it maps to no canonical place. */
  private async stopAsPlace(id: string): Promise<ApiResult<PlaceDetailDto> | null> {
    const [stop] = await this.sequelize.query<{
      id: string; name: string; providerCode: string; lat: string | null; lng: string | null;
    }>(
      `SELECT id, name, "providerCode",
              metadata->>'latitude' AS lat, metadata->>'longitude' AS lng
       FROM bus_stops WHERE id = :id LIMIT 1`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );

    if (!stop) return null;

    const routes = await this.sequelize.query<{ id: string; name: string; providerCode: string }>(
      `SELECT DISTINCT r.id, r."longName" AS name, r."providerCode"
       FROM bus_route_stops rs
       JOIN bus_routes r ON r.id = rs."routeId"
       WHERE rs."stopId" = :id
       ORDER BY r."longName" LIMIT 50`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );

    return new ApiResult(
      {
        id: stop.id,
        title: stop.name,
        category: (await this.categoryFor([stop.id])) ?? 'STOP',
        latitude: stop.lat === null ? null : Number(stop.lat),
        longitude: stop.lng === null ? null : Number(stop.lng),
        confidence: null,
        verified: false,
        aliases: [],
        routes,
        departures: await this.departuresFor([stop.id]),
        stopCount: 1,
        sources: await this.sourcesFor([stop.providerCode]),
      },
      { providers: [stop.providerCode] },
    );
  }
}
