import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { RouteController } from './controllers/route.controller';
import { RouteService } from './services/route.service';
import { RouteRepository } from './repositories/route.repository';
import { RouteMapper } from './mappers/route.mapper';
import { BusRouteModel } from '../provider-ingestion/infrastructure/sequelize/models/bus-network.model';

@Module({
  imports: [SequelizeModule.forFeature([BusRouteModel])],
  controllers: [RouteController],
  providers: [RouteService, RouteRepository, RouteMapper],
  exports: [RouteService],
})
export class RouteModule {}
