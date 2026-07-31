import { Controller, Get, Param, Query } from '@nestjs/common';
import { MetroNetworkQueryService } from '../../application/MetroNetworkQueryService';

@Controller('v1/regions/:regionSlug/metro')
export class MetroNetworkController {
  constructor(private readonly metroNetwork: MetroNetworkQueryService) {}

  @Get('lines')
  async listLines(@Param('regionSlug') regionSlug: string) {
    return {
      data: await this.metroNetwork.listLines(regionSlug),
    };
  }

  @Get('lines/:id')
  async getLine(@Param('regionSlug') regionSlug: string, @Param('id') id: string) {
    return {
      data: await this.metroNetwork.getLine(regionSlug, id),
    };
  }

  @Get('stations')
  async listStations(
    @Param('regionSlug') regionSlug: string,
    @Query('lineId') lineId?: string,
    @Query('search') search?: string,
  ) {
    return {
      data: await this.metroNetwork.listStations(regionSlug, { lineId, search }),
    };
  }

  @Get('stations/:id')
  async getStation(@Param('regionSlug') regionSlug: string, @Param('id') id: string) {
    return {
      data: await this.metroNetwork.getStation(regionSlug, id),
    };
  }
}
