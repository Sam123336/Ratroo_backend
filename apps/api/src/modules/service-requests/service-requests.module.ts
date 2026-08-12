import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ServiceRequestsController } from './controllers/service-requests.controller';
import { ServiceRequestModel } from './entities/service-request.model';
import { ServiceRequestsService } from './services/service-requests.service';

/** Riders in states Ratroo does not cover yet, asking to be told when it does. */
@Module({
  imports: [SequelizeModule.forFeature([ServiceRequestModel])],
  controllers: [ServiceRequestsController],
  providers: [ServiceRequestsService],
  exports: [ServiceRequestsService],
})
export class ServiceRequestsModule {}
