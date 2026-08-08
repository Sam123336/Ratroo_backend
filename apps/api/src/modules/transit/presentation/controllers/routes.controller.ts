import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { FindRoutesUseCase } from '../../application/use-cases/FindRoutesUseCase';
import { FindRouteDetailsUseCase } from '../../application/use-cases/FindRouteDetailsUseCase';

@Controller('v1/routes')
export class RoutesController {
  constructor(
    private readonly findRoutes: FindRoutesUseCase,
    private readonly findRouteDetails: FindRouteDetailsUseCase,
    private readonly sequelize: Sequelize,
  ) {}

  @Get()
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 50,
    @Query('search') search?: string,
  ) {
    const result = await this.findRoutes.execute({ page: +page, limit: +limit, search });
    return { data: result.items, total: result.total, page: +page, limit: +limit };
  }

  // ParseUUIDPipe: a non-UUID id used to reach Postgres and 500 on a cast error.
  // Returned bare — TransformResponseInterceptor supplies the { success, data } envelope.
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const route = await this.findRouteDetails.execute(id);
    return this.decorateForClients(route as unknown as Record<string, unknown>);
  }

  /**
   * The stored row has originStopId/destinationStopId/provider/shortName; the
   * mobile client reads originName/destinationName/providerCode/routeCode and
   * fell back to "Unknown" for every one of them. Resolve the stop names and
   * expose both spellings so neither side has to guess.
   */
  private async decorateForClients(route: Record<string, unknown>) {
    const plain = (route as { toJSON?: () => Record<string, unknown> }).toJSON?.() ?? route;
    const [origin, destination] = await Promise.all([
      this.stopName(plain.originStopId as string | null),
      this.stopName(plain.destinationStopId as string | null),
    ]);

    return {
      ...plain,
      originId: plain.originStopId,
      destinationId: plain.destinationStopId,
      originName: origin,
      destinationName: destination,
      // shortName is a synthetic code that repeats across unrelated routes, and
      // externalId is a scraper slug. Neither is a name; the client decides what
      // to show, so hand it both rather than a misleading "routeCode".
      routeCode: plain.shortName,
      providerCode: plain.provider,
      // Null until the provider is seeded with a confirmed URL — the client
      // hides the link rather than offering one that goes nowhere.
      providerWebsite: await this.providerWebsite(plain.provider as string | null),
      stops: await this.stopsAlongRoute(
        plain.id as string,
        (plain.originStopId as string | null) ?? null,
      ),
    };
  }

  private async providerWebsite(code: string | null) {
    if (!code) return null;

    const [row] = await this.sequelize.query<{ website: string | null }>(
      `SELECT website FROM providers WHERE code = :code LIMIT 1`,
      { replacements: { code }, type: QueryTypes.SELECT },
    );

    return row?.website ?? null;
  }

  /**
   * The stops one vehicle calls at, in order, with its scheduled times.
   *
   * Scoped to a single trip: a route stores one trip per direction, and merging
   * them produced an out-and-back sequence that visited the origin twice.
   */
  private async stopsAlongRoute(routeId: string, originStopId: string | null) {
    return this.sequelize.query<{
      name: string;
      stopSequence: number;
      departureTime: string | null;
      latitude: number | null;
      longitude: number | null;
    }>(
      `SELECT s.name,
              st."stopSequence",
              st."departureTime",
              s.latitude,
              s.longitude
       FROM stop_times st
       JOIN stops s ON s.id = st."stopId"
       WHERE st."tripId" = (
         SELECT t.id FROM trips t
         WHERE t."routeId" = :routeId
         -- Prefer the direction that actually starts where the route says it
         -- does, otherwise a route titled "Bandwan to Kolkata" listed the
         -- return working and opened at Kolkata.
         ORDER BY (
           SELECT st2."stopId" FROM stop_times st2
           WHERE st2."tripId" = t.id ORDER BY st2."stopSequence" LIMIT 1
         ) IS DISTINCT FROM :originStopId,
         t.direction, t.id
         LIMIT 1
       )
       ORDER BY st."stopSequence"`,
      { replacements: { routeId, originStopId }, type: QueryTypes.SELECT },
    );
  }

  private async stopName(stopId: string | null) {
    if (!stopId) return null;

    const [row] = await this.sequelize.query<{ name: string }>(
      `SELECT name FROM stops WHERE id = :stopId LIMIT 1`,
      { replacements: { stopId }, type: QueryTypes.SELECT },
    );

    return row?.name ?? null;
  }
}
