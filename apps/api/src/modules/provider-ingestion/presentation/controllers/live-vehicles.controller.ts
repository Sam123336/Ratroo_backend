import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { LiveVehicleService } from '../../application/LiveVehicleService';

/**
 * Buses that are moving right now, for the map.
 *
 * Public and unauthenticated like the rest of the rider surface, but it fans
 * out to an operator with no published rate limit, so the service behind it
 * caps the routes queried and shares one upstream answer between riders
 * standing in the same place.
 */
@Controller('v1/live')
export class LiveVehiclesController {
  constructor(private readonly live: LiveVehicleService) {}

  @Get('vehicles')
  async vehicles(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radius') radius?: string,
  ) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new BadRequestException('lat and lng are required.');
    }

    // Widening the radius widens the fan-out upstream, so it is bounded here
    // rather than trusted from the query string.
    const metres = Math.min(5000, Math.max(500, Number(radius) || 2000));
    const result = await this.live.near(latitude, longitude, metres);

    return {
      data: result.vehicles,
      meta: {
        routesQueried: result.routesQueried,
        cached: result.cached,
        observedAt: result.observedAt,
        // Only BMTC publishes vehicle positions; nothing else on the map is
        // live, and the client should not imply otherwise.
        source: 'BMTC_OFFICIAL',
      },
    };
  }
}
