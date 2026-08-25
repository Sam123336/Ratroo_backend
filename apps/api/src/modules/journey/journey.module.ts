import { Module } from '@nestjs/common';
import { JourneyController } from './controllers/journey.controller';
import { JourneyRepository } from './repositories/journey.repository';
import { JourneyPlannerService } from './services/journey-planner.service';
import { JourneyService } from './services/journey.service';
import { TransitGraphService } from './services/transit-graph.service';
import { SequelizeModule } from '@nestjs/sequelize';
import { PlaceAliasModel, PlaceModel } from '../places/entities/place.model';
import {
  BusRouteModel,
  BusRouteStopModel,
  BusStopModel,
  MetroStationModel,
} from '../provider-ingestion/infrastructure/sequelize/models';

@Module({
  imports: [
    SequelizeModule.forFeature([
      PlaceModel,
      PlaceAliasModel,
      BusStopModel,
      BusRouteStopModel,
      BusRouteModel,
      MetroStationModel,
    ]),
  ],
  controllers: [JourneyController],
  providers: [JourneyService, JourneyRepository, JourneyPlannerService, TransitGraphService],
  exports: [JourneyService, TransitGraphService],
})
export class JourneyModule {}
