import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmStopEntity } from './infrastructure/typeorm/entities/typeorm-stop.entity';
import { TypeOrmRouteEntity } from './infrastructure/typeorm/entities/typeorm-route.entity';
import { TypeOrmTripEntity } from './infrastructure/typeorm/entities/typeorm-trip.entity';
import { TypeOrmAgencyEntity } from './infrastructure/typeorm/entities/typeorm-agency.entity';
import { TypeOrmStopTimeEntity } from './infrastructure/typeorm/entities/typeorm-stop-time.entity';

import { PostgresStopRepository } from './infrastructure/repositories/PostgresStopRepository';
import { PostgresRouteRepository } from './infrastructure/repositories/PostgresRouteRepository';
import { PostgresTripRepository } from './infrastructure/repositories/PostgresTripRepository';
import { PostgresAgencyRepository } from './infrastructure/repositories/PostgresAgencyRepository';

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

const repositoryProviders = [
  {
    provide: STOP_REPOSITORY_TOKEN,
    useClass: PostgresStopRepository,
  },
  {
    provide: ROUTE_REPOSITORY_TOKEN,
    useClass: PostgresRouteRepository,
  },
  {
    provide: TRIP_REPOSITORY_TOKEN,
    useClass: PostgresTripRepository,
  },
  {
    provide: AGENCY_REPOSITORY_TOKEN,
    useClass: PostgresAgencyRepository,
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
    TypeOrmModule.forFeature([
      TypeOrmStopEntity,
      TypeOrmRouteEntity,
      TypeOrmTripEntity,
      TypeOrmAgencyEntity,
      TypeOrmStopTimeEntity,
    ]),
  ],
  controllers: [StopsController, RoutesController],
  providers: [
    ...repositoryProviders,
    ...useCaseProviders,
    PostgresStopRepository,
    PostgresRouteRepository,
    PostgresTripRepository,
    PostgresAgencyRepository,
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
