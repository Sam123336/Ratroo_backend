import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { GetRegionUseCase } from '../services/GetRegionUseCase';
import { ListRegionsUseCase } from '../services/ListRegionsUseCase';

interface ProviderRow {
  code: string;
  name: string | null;
  website: string | null;
  routeCount: number;
  modes: string[];
  lastUpdated: Date | null;
}

/** Stops store a state code; the app needs something a person would say. */
const STATE_NAMES: Record<string, string> = {
  WB: 'West Bengal',
  KA: 'Karnataka',
};

@Controller('v1/coverage')
export class CoverageController {
  constructor(
    private readonly listRegions: ListRegionsUseCase,
    private readonly getRegion: GetRegionUseCase,
    private readonly sequelize: Sequelize,
  ) {}

  @Get('regions')
  findAllRegions() {
    const regions = this.listRegions.execute();
    return {
      data: regions,
      count: regions.length,
    };
  }

  @Get('regions/:slug')
  findRegion(@Param('slug') slug: string) {
    return {
      data: this.getRegion.execute(slug),
    };
  }

  /**
   * What we actually cover around a point, for the app's home screen.
   *
   * The header used to read "Live bus, metro, rail and ferry across West
   * Bengal" and "2800 routes mapped" to everyone, including a user in
   * Bengaluru. Both numbers and both place names now come from the stops and
   * routes we hold, so the screen can only claim what exists.
   */
  @Get('summary')
  async summary(@Query('lat') lat?: string, @Query('lng') lng?: string) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    const located = Number.isFinite(latitude) && Number.isFinite(longitude);

    // Which region the rider is standing in, by polygon.
    //
    // This used to be "the nearest stop that carries a state label", which
    // made a single mis-geocoded row able to relabel the whole home screen: two
    // KOLKATA_TRAM stops named "Central" and "MG Road" hold Bengaluru
    // coordinates, and until Bengaluru had stops of its own they were the
    // closest labelled stops to a rider there — who was then told about ferries
    // and trams in West Bengal, 1,500 km away.
    //
    // A polygon cannot be moved by one bad row: the builder drops sparse
    // outliers as clustering noise before hulling. `npm run
    // regions:build-polygons` populates it.
    const [contained] = located
      ? await this.sequelize.query<{ state: string | null; stateName: string | null; areaType: string }>(
          `SELECT "stateCode" AS state, "stateName", "areaType" FROM coverage_areas
           WHERE "areaType" IN ('STATE', 'ADMIN_STATE') AND boundary IS NOT NULL
             AND ST_Covers(boundary, ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326))
           -- Real service coverage wins. ADMIN_STATE is only the fallback that
           -- names the state; it never claims the whole state has transport.
           ORDER BY CASE "areaType" WHEN 'STATE' THEN 0 ELSE 1 END, ST_Area(boundary) ASC
           LIMIT 1`,
          { replacements: { latitude, longitude }, type: QueryTypes.SELECT },
        )
      : [];

    // Outside every polygon — either genuinely uncovered, or the polygons have
    // not been built yet. Fall back to the nearest labelled stop, but only
    // within a radius where the answer is still plausible: an unbounded nearest
    // is what produced the West Bengal answer in the first place.
    const [nearest] = located && !contained?.state
      ? await this.sequelize.query<{ state: string | null }>(
          `SELECT state FROM stops
           WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND state IS NOT NULL
             AND ST_DWithin(
               ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
               ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography,
               :radiusMetres)
           ORDER BY ST_DistanceSphere(
             ST_MakePoint(longitude, latitude), ST_MakePoint(:longitude, :latitude))
           LIMIT 1`,
          {
            replacements: {
              latitude,
              longitude,
              radiusMetres: Number(process.env.COVERAGE_FALLBACK_RADIUS_M ?? 50_000),
            },
            type: QueryTypes.SELECT,
          },
        )
      : [];

    const stateCode = contained?.state ?? nearest?.state ?? null;

    // Operators are tied to a state through the stops they serve, which is the
    // only link the schema gives us — routes carry a provider, not a region.
    // Counted per mode rather than as one total, because the home screen shows
    // a tile per mode and a mode with no routes has to say so. Metro currently
    // returns nothing here, and that absence is the honest answer.
    const rows = stateCode
      ? await this.sequelize.query<{ mode: string; routeCount: number; stopCount: number }>(
          `SELECT lower(r."routeType") AS mode,
                  count(DISTINCT r.id)::int AS "routeCount",
                  count(DISTINCT s.id)::int AS "stopCount"
           FROM routes r
           JOIN trips t ON t."routeId" = r.id
           JOIN stop_times st ON st."tripId" = t.id
           JOIN stops s ON s.id = st."stopId"
           WHERE s.state = :stateCode
             AND r."routeType" IS NOT NULL
           GROUP BY lower(r."routeType")
           ORDER BY count(DISTINCT r.id) DESC`,
          { replacements: { stateCode }, type: QueryTypes.SELECT },
        )
      : [];

    // The same counts, grouped by city, so the app can show what runs in
    // Kolkata separately from what runs in Bardhaman. Trams and ferries exist
    // in exactly one city; a state-wide list implies they run everywhere.
    //
    // Only cities with named stops appear. `stops.city` is sparsely filled, so
    // the unnamed remainder stays in the state totals rather than becoming a
    // city called "Unknown".
    const cityRows = stateCode
      ? await this.sequelize.query<{
          city: string;
          mode: string;
          routeCount: number;
          stopCount: number;
        }>(
          `SELECT s.city,
                  lower(r."routeType") AS mode,
                  count(DISTINCT r.id)::int AS "routeCount",
                  count(DISTINCT s.id)::int AS "stopCount"
           FROM stops s
           JOIN stop_times st ON st."stopId" = s.id
           JOIN trips t ON t.id = st."tripId"
           JOIN routes r ON r.id = t."routeId"
           WHERE s.state = :stateCode
             AND s.city IS NOT NULL AND s.city <> ''
             AND r."routeType" IS NOT NULL
           GROUP BY s.city, lower(r."routeType")
           ORDER BY s.city, count(DISTINCT r.id) DESC`,
          { replacements: { stateCode }, type: QueryTypes.SELECT },
        )
      : [];

    // Every stop we hold in the state, including ones no trip calls at yet —
    // the per-mode stopCount above only sees stops with scheduled service.
    const [totals] = stateCode
      ? await this.sequelize.query<{ stopCount: number; lastUpdated: Date | null }>(
          `SELECT count(*)::int AS "stopCount", max("updatedAt") AS "lastUpdated"
           FROM stops WHERE state = :stateCode`,
          { replacements: { stateCode }, type: QueryTypes.SELECT },
        )
      : [];

    return {
      data: {
        stateCode,
        region: stateCode ? (contained?.stateName ?? STATE_NAMES[stateCode] ?? stateCode) : null,
        routeCount: rows.reduce((sum, row) => sum + row.routeCount, 0),
        stopCount: totals?.stopCount ?? 0,
        lastUpdated: totals?.lastUpdated ?? null,
        // Only the modes that genuinely have routes here. Empty is a real
        // answer: it means we have stops but no services mapped yet.
        modes: rows.map(row => row.mode),
        coverageMethod: contained?.areaType === 'STATE'
          ? 'service-coverage-polygon'
          : contained?.areaType === 'ADMIN_STATE'
            ? 'administrative-state-boundary'
            : nearest?.state
              ? 'nearby-transit-stop'
              : null,
        byMode: rows.map(row => ({
          mode: row.mode,
          routeCount: row.routeCount,
          stopCount: row.stopCount,
        })),
        // Busiest city first, and inside each, the busiest mode.
        byCity: groupByCity(cityRows),
      },
    };
  }

  /**
   * The operators behind the data, counted from it.
   *
   * Listed from the routes themselves rather than the providers table, because
   * only four operators are registered there while thirteen appear in the data.
   * A registered operator contributes its name and confirmed website; the rest
   * show their code and no link.
   */
  @Get('providers')
  async providers() {
    const rows = await this.sequelize.query<ProviderRow>(
      `SELECT r.provider AS code,
              p.name,
              p.website,
              count(*)::int AS "routeCount",
              array_agg(DISTINCT r."routeType") AS modes,
              max(r."updatedAt") AS "lastUpdated"
       FROM routes r
       LEFT JOIN providers p ON p.code = r.provider
       GROUP BY r.provider, p.name, p.website
       ORDER BY "routeCount" DESC`,
      { type: QueryTypes.SELECT },
    );

    return { data: rows.map(row => this.presentProvider(row)), count: rows.length };
  }

  @Get('providers/:code')
  async provider(@Param('code') code: string) {
    const [row] = await this.sequelize.query<ProviderRow>(
      `SELECT r.provider AS code,
              p.name,
              p.website,
              count(*)::int AS "routeCount",
              array_agg(DISTINCT r."routeType") AS modes,
              max(r."updatedAt") AS "lastUpdated"
       FROM routes r
       LEFT JOIN providers p ON p.code = r.provider
       WHERE r.provider = :code
       GROUP BY r.provider, p.name, p.website`,
      { replacements: { code }, type: QueryTypes.SELECT },
    );

    if (!row) throw new NotFoundException(`No operator with code ${code}.`);

    // Where it runs, from the stops it serves. Districts are sparse, so state
    // is the fallback rather than an empty list.
    const areas = await this.sequelize.query<{ area: string }>(
      `SELECT DISTINCT COALESCE(district, city, state) AS area
       FROM stops WHERE provider = :code AND COALESCE(district, city, state) IS NOT NULL
       ORDER BY area LIMIT 12`,
      { replacements: { code }, type: QueryTypes.SELECT },
    );

    const [stops] = await this.sequelize.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM stops WHERE provider = :code`,
      { replacements: { code }, type: QueryTypes.SELECT },
    );

    return {
      data: {
        ...this.presentProvider(row),
        stopCount: stops?.count ?? 0,
        coverage: areas.map(a => a.area),
      },
    };
  }

  private presentProvider(row: ProviderRow) {
    return {
      code: row.code,
      // Falls back to the code: inventing a friendly name for an unregistered
      // operator would be making up a fact about a real company.
      name: row.name ?? row.code,
      website: row.website ?? null,
      registered: row.name !== null,
      routeCount: row.routeCount,
      modes: (row.modes ?? []).filter(Boolean).map(mode => mode.toLowerCase()),
      lastUpdated: row.lastUpdated,
    };
  }

  @Get('regions/:slug/providers')
  findRegionProviders(@Param('slug') slug: string) {
    const region = this.getRegion.execute(slug);
    return {
      data: region.providers,
      count: region.providers.length,
      region: {
        slug: region.slug,
        name: region.name,
        status: region.status,
      },
    };
  }
}

/**
 * Flat (city, mode) rows into one entry per city.
 *
 * Done here rather than in SQL so the shape the app reads is written in
 * TypeScript, where it can be read alongside the DTO it feeds.
 */
function groupByCity(
  rows: Array<{ city: string; mode: string; routeCount: number; stopCount: number }>,
) {
  const cities = new Map<
    string,
    { city: string; routeCount: number; byMode: Array<{ mode: string; routeCount: number; stopCount: number }> }
  >();

  for (const row of rows) {
    const entry = cities.get(row.city) ?? { city: row.city, routeCount: 0, byMode: [] };
    entry.byMode.push({
      mode: row.mode,
      routeCount: row.routeCount,
      stopCount: row.stopCount,
    });
    entry.routeCount += row.routeCount;
    cities.set(row.city, entry);
  }

  return [...cities.values()]
    .map(city => ({
      ...city,
      byMode: city.byMode.sort((a, b) => b.routeCount - a.routeCount),
    }))
    .sort((a, b) => b.routeCount - a.routeCount);
}
