import { Controller, Get, Param, Query } from '@nestjs/common';
import { BusNetworkQueryService } from '../../application/BusNetworkQueryService';

@Controller('v1/regions/:regionSlug/bus')
export class BusNetworkController {
  constructor(private readonly busNetwork: BusNetworkQueryService) {}

  @Get('routes')
  async listRoutes(@Param('regionSlug') regionSlug: string, @Query('search') search?: string) {
    return {
      data: await this.busNetwork.listRoutes(regionSlug, { search }),
    };
  }

  @Get('routes/:id')
  async getRoute(@Param('regionSlug') regionSlug: string, @Param('id') id: string) {
    return {
      data: await this.busNetwork.getRoute(regionSlug, id),
    };
  }

  @Get('stops')
  async listStops(@Param('regionSlug') regionSlug: string, @Query('search') search?: string) {
    return {
      data: await this.busNetwork.listStops(regionSlug, { search }),
    };
  }
}
