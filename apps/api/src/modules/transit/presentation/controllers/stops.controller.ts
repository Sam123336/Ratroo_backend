import { Controller, Get, Param, Query, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize as Seq } from 'sequelize';
import {
  RouteModel, StopModel, StopTimeModel, TripModel,
} from '../../infrastructure/sequelize/models';
import { FindNearbyStopsUseCase } from '../../application/use-cases/FindNearbyStopsUseCase';
import { FindStopByIdUseCase } from '../../application/use-cases/FindStopByIdUseCase';
import { NearbyStopsDto } from './dto/nearby-stops.dto';

@Controller('v1/stops')
export class StopsController {
  constructor(
    private readonly findNearbyStops: FindNearbyStopsUseCase,
    private readonly findStopById: FindStopByIdUseCase,
    @InjectModel(StopModel) private readonly stops: typeof StopModel,
    @InjectModel(StopTimeModel) private readonly stopTimes: typeof StopTimeModel,
  ) {}

  /**
   * The stops of one mode across a region, busiest first.
   *
   * Ferry ghats, tram stops and railway stations number in the tens, so they
   * can be browsed as places rather than counted. Bus stops cannot — 2,150 of
   * them is a list nobody reads — which is why this takes a mode rather than
   * returning everything.
   *
   * "Busiest" is departures, which is countable. Not "popular": we have no
   * usage signal and will not invent one.
   */
  @Get('by-mode')
  async byMode(
    @Query('mode') mode?: string,
    @Query('state') state?: string,
    @Query('limit') limit?: string,
  ) {
    const routeType = (mode ?? '').toUpperCase();
    if (!routeType) throw new NotFoundException('A mode is required.');

    // Joined through the associations rather than a literal subquery: the
    // route type lives two hops away (stop_time → trip → route), and the ORM
    // can express that. `raw` flattens the aggregate and the joined columns
    // into one row, which is why the count comes back at all — read off the
    // model instance it stayed on dataValues and serialised as zero.
    const rows = await this.stopTimes.findAll({
      attributes: [
        'stopId',
        [Seq.fn('COUNT', Seq.col('StopTimeModel.id')), 'departures'],
      ],
      include: [
        {
          model: StopModel,
          attributes: ['id', 'name', 'city', 'district', 'latitude', 'longitude'],
          required: true,
          where: state ? { state: state.toUpperCase() } : {},
        },
        {
          model: TripModel,
          attributes: [],
          required: true,
          include: [
            {
              model: RouteModel,
              attributes: [],
              required: true,
              where: Seq.where(
                Seq.fn('upper', Seq.col('trip->route.routeType')),
                routeType,
              ),
            },
          ],
        },
      ],
      group: [
        'StopTimeModel.stopId',
        'stop.id',
      ],
      order: [[Seq.fn('COUNT', Seq.col('StopTimeModel.id')), 'DESC']],
      limit: Math.min(Number(limit) || 20, 50),
      subQuery: false,
      raw: true,
    });

    return {
      data: (rows as unknown as Array<Record<string, unknown>>).map(row => ({
        id: row['stop.id'],
        name: row['stop.name'],
        area: row['stop.city'] ?? row['stop.district'],
        latitude: row['stop.latitude'],
        longitude: row['stop.longitude'],
        departures: Number(row.departures ?? 0),
      })),
    };
  }


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
