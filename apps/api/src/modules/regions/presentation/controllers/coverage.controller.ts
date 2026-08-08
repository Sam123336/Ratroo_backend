import { Controller, Get, Param, Query } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { GetRegionUseCase } from '../../application/GetRegionUseCase';
import { ListRegionsUseCase } from '../../application/ListRegionsUseCase';

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
    const rows = stateCode
      ? await this.sequelize.query<{ routeCount: number; modes: string[] }>(
          `WITH operators AS (
             SELECT DISTINCT provider FROM stops WHERE state = :stateCode
           )
           SELECT count(*)::int AS "routeCount",
                  array_agg(DISTINCT "routeType") AS modes
           FROM routes WHERE provider IN (SELECT provider FROM operators)`,
          { replacements: { stateCode }, type: QueryTypes.SELECT },
        )
      : [];

    return {
      data: {
        stateCode,
        region: stateCode ? (STATE_NAMES[stateCode] ?? stateCode) : null,
        routeCount: rows[0]?.routeCount ?? 0,
        // Only the modes that genuinely have routes here. Empty is a real
        // answer: it means we have stops but no services mapped yet.
        modes: (rows[0]?.modes ?? []).filter(Boolean).map(mode => mode.toLowerCase()),
      },
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

