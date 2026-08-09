import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { isExactRouteLink, routeSearchUrl, routeSourceUrl } from '../../../../shared/provider-links';
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
      // The operator's page for THIS route, so "open the source" does not
      // dump the user on a search form they have to fill in again.
      sourceUrl:
        routeSourceUrl(plain.provider as string | null, plain.externalId as string | null) ??
        // Nothing operator-specific: fall back to every bus running this
        // corridor on WBBus.in, which indexes all operators.
        routeSearchUrl(
          await this.wbbusName(plain.originStopId as string | null),
          await this.wbbusName(plain.destinationStopId as string | null),
        ),
      // Lets the client say "view THIS route" versus "browse all routes",
      // rather than promising a page the operator does not have.
      sourceIsExact: isExactRouteLink(
        plain.provider as string | null,
        plain.externalId as string | null,
      ),
      // What the link actually is, decided here so the button label cannot
      // drift from the URL it opens.
      sourceKind: isExactRouteLink(
        plain.provider as string | null,
        plain.externalId as string | null,
      )
        ? 'route'
        : (await this.wbbusName(plain.originStopId as string | null)) &&
            (await this.wbbusName(plain.destinationStopId as string | null))
          ? 'search'
          : routeSourceUrl(plain.provider as string | null, null)
            ? 'index'
            : 'site',
      stops: await this.stopsAlongRoute(
        plain.id as string,
        (plain.originStopId as string | null) ?? null,
      ),
      ...(await this.busName(plain.id as string)),
    };
  }

  /**
   * The name painted on the bus, e.g. "APANJAN" — how West Bengal's private
   * services are identified at the stand.
   *
   * Only WBBUS and BUSSATHI record one; every WBTC, NBSTC, SBSTC, ferry, tram
   * and rail trip has none. Null rather than a placeholder, so the client can
   * omit the field instead of showing an empty label.
   */
  private async busName(routeId: string) {
    const [row] = await this.sequelize.query<{
      operator: string | null;
      vehicle: string | null;
    }>(
      `SELECT "vehicleName" AS operator, "vehicleRegistration" AS vehicle
       FROM trips
       WHERE "routeId" = :routeId AND "vehicleName" IS NOT NULL
       LIMIT 1`,
      { replacements: { routeId }, type: QueryTypes.SELECT },
    );

    return { operator: row?.operator ?? null, vehicle: row?.vehicle ?? null };
  }

  /**
   * The name WBBus.in uses for the same place as this stop.
   *
   * SBSTC calls it "ARAMBAG (NS)"; WBBus calls it "Arambagh". Both stops map to
   * one canonical place, and our WBBUS-provider stops carry WBBus's spelling,
   * so the place is the bridge. Null when no WBBUS stop shares the place —
   * then there is no search to link to.
   */
  private async wbbusName(stopId: string | null): Promise<string | null> {
    if (!stopId) return null;

    const [row] = await this.sequelize.query<{ name: string }>(
      `SELECT s.name
       FROM bus_stops target
       JOIN bus_stops twin ON twin."placeId" = target."placeId"
       JOIN stops s ON s.id = twin.id
       WHERE target.id = :stopId AND s.provider = 'WBBUS'
       ORDER BY length(s.name)
       LIMIT 1`,
      { replacements: { stopId }, type: QueryTypes.SELECT },
    );

    return row?.name ?? null;
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
