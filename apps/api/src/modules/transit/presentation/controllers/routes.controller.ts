import { Controller, Get, Param, Query } from '@nestjs/common';
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

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const route = await this.findRouteDetails.execute(id);
    return { data: route };
  }
}
