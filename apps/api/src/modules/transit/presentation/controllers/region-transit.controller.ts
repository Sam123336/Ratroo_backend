import { Controller, Get, Param, Query } from '@nestjs/common';
import { RegionRegistryService } from '../../../regions/application/RegionRegistryService';
import { FindNearbyStopsUseCase } from '../../application/use-cases/FindNearbyStopsUseCase';
import { FindRoutesUseCase } from '../../application/use-cases/FindRoutesUseCase';
import { NearbyStopsDto } from './dto/nearby-stops.dto';

@Controller('v1/regions/:regionSlug')
export class RegionTransitController {
  constructor(
    private readonly regions: RegionRegistryService,
    private readonly findNearbyStops: FindNearbyStopsUseCase,
    private readonly findRoutes: FindRoutesUseCase,
  ) {}

  @Get('stops/nearby')
  async findNearbyStopsForRegion(
    @Param('regionSlug') regionSlug: string,
    @Query() query: NearbyStopsDto,
  ) {
    const region = this.regions.findBySlug(regionSlug);
    const stops = await this.findNearbyStops.execute({
      latitude: query.lat,
      longitude: query.lng,
      radiusMeters: query.radius,
      scope: region.scope,
    });

    return {
      data: stops,
      count: stops.length,
      region: {
        slug: region.slug,
        name: region.name,
        status: region.status,
      },
      searchCenter: {
        lat: query.lat,
        lng: query.lng,
        radiusMeters: query.radius,
      },
    };
  }

  @Get('routes')
  async findRoutesForRegion(
    @Param('regionSlug') regionSlug: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
    @Query('search') search?: string,
  ) {
    const region = this.regions.findBySlug(regionSlug);
    const result = await this.findRoutes.execute({
      page: +page,
      limit: +limit,
      search,
      scope: region.scope,
    });

    return {
      data: result.items,
      total: result.total,
      page: +page,
      limit: +limit,
      region: {
        slug: region.slug,
        name: region.name,
        status: region.status,
      },
    };
  }
}
