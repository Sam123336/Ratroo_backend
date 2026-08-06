import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { FindRoutesUseCase } from '../../application/use-cases/FindRoutesUseCase';
import { FindRouteDetailsUseCase } from '../../application/use-cases/FindRouteDetailsUseCase';

@Controller('v1/routes')
export class RoutesController {
  constructor(
    private readonly findRoutes: FindRoutesUseCase,
    private readonly findRouteDetails: FindRouteDetailsUseCase,
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
    return this.findRouteDetails.execute(id);
  }
}
