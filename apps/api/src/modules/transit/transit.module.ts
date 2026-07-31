import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import {
  AgencyModel,
  RouteModel,
  StopModel,
  StopTimeModel,
  TripModel,
} from './infrastructure/sequelize/models';

import { SequelizeStopRepository } from './infrastructure/sequelize/repositories/SequelizeStopRepository';
import { SequelizeRouteRepository } from './infrastructure/sequelize/repositories/SequelizeRouteRepository';
import { SequelizeTripRepository } from './infrastructure/sequelize/repositories/SequelizeTripRepository';
import { SequelizeAgencyRepository } from './infrastructure/sequelize/repositories/SequelizeAgencyRepository';

import { STOP_REPOSITORY_TOKEN } from './domain/repositories/StopRepository';
import { ROUTE_REPOSITORY_TOKEN } from './domain/repositories/RouteRepository';
import { TRIP_REPOSITORY_TOKEN } from './domain/repositories/TripRepository';
import { AGENCY_REPOSITORY_TOKEN } from './domain/repositories/AgencyRepository';

import { FindNearbyStopsUseCase } from './application/use-cases/FindNearbyStopsUseCase';
import { FindStopByIdUseCase } from './application/use-cases/FindStopByIdUseCase';
import { FindRouteDetailsUseCase } from './application/use-cases/FindRouteDetailsUseCase';
import { FindRoutesUseCase } from './application/use-cases/FindRoutesUseCase';

import { StopsController } from './presentation/controllers/stops.controller';
import { RoutesController } from './presentation/controllers/routes.controller';
import { RegionTransitController } from './presentation/controllers/region-transit.controller';
import { RegionsModule } from '../regions/regions.module';

const repositoryProviders = [
  {
    provide: STOP_REPOSITORY_TOKEN,
    useClass: SequelizeStopRepository,
  },
  {
    provide: ROUTE_REPOSITORY_TOKEN,
    useClass: SequelizeRouteRepository,
  },
  {
    provide: TRIP_REPOSITORY_TOKEN,
    useClass: SequelizeTripRepository,
  },
  {
    provide: AGENCY_REPOSITORY_TOKEN,
    useClass: SequelizeAgencyRepository,
  },
];

const useCaseProviders = [
  FindNearbyStopsUseCase,
  FindStopByIdUseCase,
  FindRouteDetailsUseCase,
  FindRoutesUseCase,
];

@Module({
  imports: [
    RegionsModule,
    SequelizeModule.forFeature([
      AgencyModel,
      StopModel,
      RouteModel,
      TripModel,
      StopTimeModel,
    ]),
  ],
  controllers: [StopsController, RoutesController, RegionTransitController],
  providers: [
    ...repositoryProviders,
    ...useCaseProviders,
    SequelizeStopRepository,
    SequelizeRouteRepository,
    SequelizeTripRepository,
    SequelizeAgencyRepository,
  ],
  exports: [
    STOP_REPOSITORY_TOKEN,
    ROUTE_REPOSITORY_TOKEN,
    TRIP_REPOSITORY_TOKEN,
    AGENCY_REPOSITORY_TOKEN,
    ...useCaseProviders,
  ],
})
export class TransitModule {}
