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

    const [nearest] = located
      ? await this.sequelize.query<{ state: string | null }>(
          `SELECT state FROM stops
           WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND state IS NOT NULL
           ORDER BY ST_DistanceSphere(
             ST_MakePoint(longitude, latitude), ST_MakePoint(:longitude, :latitude))
           LIMIT 1`,
          { replacements: { latitude, longitude }, type: QueryTypes.SELECT },
        )
      : [];

    const stateCode = nearest?.state ?? null;

    // Operators are tied to a state through the stops they serve, which is the
    // only link the schema gives us — routes carry a provider, not a region.
    // Counted per mode rather than as one total, because the home screen shows
    // a tile per mode and a mode with no routes has to say so. Metro currently
    // returns nothing here, and that absence is the honest answer.
    const rows = stateCode
      ? await this.sequelize.query<{ mode: string; routeCount: number; stopCount: number }>(
          `WITH operators AS (
             SELECT DISTINCT provider FROM stops WHERE state = :stateCode
           )
           SELECT lower(r."routeType") AS mode,
                  count(DISTINCT r.id)::int AS "routeCount",
                  count(DISTINCT st."stopId")::int AS "stopCount"
           FROM routes r
           LEFT JOIN trips t ON t."routeId" = r.id
           LEFT JOIN stop_times st ON st."tripId" = t.id
           WHERE r.provider IN (SELECT provider FROM operators)
             AND r."routeType" IS NOT NULL
           GROUP BY lower(r."routeType")
           ORDER BY count(DISTINCT r.id) DESC`,
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
        region: stateCode ? (STATE_NAMES[stateCode] ?? stateCode) : null,
        routeCount: rows.reduce((sum, row) => sum + row.routeCount, 0),
        stopCount: totals?.stopCount ?? 0,
        lastUpdated: totals?.lastUpdated ?? null,
        // Only the modes that genuinely have routes here. Empty is a real
        // answer: it means we have stops but no services mapped yet.
        modes: rows.map(row => row.mode),
        byMode: rows.map(row => ({
          mode: row.mode,
          routeCount: row.routeCount,
          stopCount: row.stopCount,
        })),
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

