import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import {
  PlaceAliasModel, PlaceModel,
} from '../places/entities/place.model';
import {
  BusRouteStopModel, BusStopModel, BusStopTimeModel,
} from '../provider-ingestion/infrastructure/sequelize/models';
import {
  RouteModel, StopModel, StopTimeModel,
} from '../transit/infrastructure/sequelize/models';
import { DataConsistencyController } from './controllers/data-consistency.controller';
import { DataConsistencyScheduler } from './services/data-consistency.scheduler';
import { DataConsistencyService } from './services/data-consistency.service';

/**
 * Keeping ingested data coherent, as a scheduled concern rather than a drawer
 * of scripts someone has to remember to run.
 */
@Module({
  imports: [
    SequelizeModule.forFeature([
      StopModel,
      StopTimeModel,
      RouteModel,
      BusRouteStopModel,
      BusStopTimeModel,
      BusStopModel,
      PlaceModel,
      PlaceAliasModel,
    ]),
  ],
  controllers: [DataConsistencyController],
  providers: [DataConsistencyService, DataConsistencyScheduler],
  exports: [DataConsistencyService],
})
export class DataQualityModule {}
