import { Controller, Get, Param } from '@nestjs/common';
import { RouteService } from '../services/route.service';
import { RouteResponseDto } from '../dto/route-response.dto';
import { ApiResult } from '../../core/dto/api-response.dto';

@Controller('v1/routes')
export class RouteController {
  constructor(private readonly routeService: RouteService) {}

  @Get(':id')
  async getRouteDetails(@Param('id') id: string): Promise<ApiResult<RouteResponseDto>> {
    return this.routeService.getRouteById(id);
  }
}
