import { Controller, Get, Param, Query, NotFoundException } from '@nestjs/common';
import { FindNearbyStopsUseCase } from '../../application/use-cases/FindNearbyStopsUseCase';
import { FindStopByIdUseCase } from '../../application/use-cases/FindStopByIdUseCase';
import { NearbyStopsDto } from './dto/nearby-stops.dto';

@Controller('v1/stops')
export class StopsController {
  constructor(
    private readonly findNearbyStops: FindNearbyStopsUseCase,
    private readonly findStopById: FindStopByIdUseCase,
  ) {}

  @Get('nearby')
  async findNearby(@Query() query: NearbyStopsDto) {
    const stops = await this.findNearbyStops.execute({
      latitude: query.lat,
      longitude: query.lng,
      radiusMeters: query.radius,
    });

    return {
      data: stops,
      count: stops.length,
      searchCenter: {
        lat: query.lat,
        lng: query.lng,
        radiusMeters: query.radius,
      },
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const stop = await this.findStopById.execute(id);
    return { data: stop };
  }
}
