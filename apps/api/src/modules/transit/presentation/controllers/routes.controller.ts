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
      routeCode: plain.shortName ?? plain.externalId,
      providerCode: plain.provider,
    };
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
