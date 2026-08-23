import { Controller, Get, Param, Query } from '@nestjs/common';
import { BusNetworkQueryService } from '../../application/BusNetworkQueryService';

@Controller('v1/regions/:regionSlug/bus')
export class BusNetworkController {
  constructor(private readonly busNetwork: BusNetworkQueryService) {}

  @Get('routes')
  async listRoutes(
    @Param('regionSlug') regionSlug: string,
    @Query('search') search?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radiusKm') radiusKm?: string,
  ) {
    return {
      data: await this.busNetwork.listRoutes(regionSlug, {
        search,
        // Absent stays absent: Number('') and Number(null) are both 0, which
        // would silently scope every unfiltered request to the null island.
        lat: this.coordinate(lat),
        lng: this.coordinate(lng),
        radiusKm: this.coordinate(radiusKm),
      }),
    };
  }

  private coordinate(value?: string): number | undefined {
    if (value === undefined || value === null || value.trim() === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
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
