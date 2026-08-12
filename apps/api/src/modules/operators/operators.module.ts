import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuthModule } from '../auth/auth.module';
import { OperatorRoutesController } from './controllers/operator-routes.controller';
import { OperatorsController } from './controllers/operators.controller';
import { OperatorRouteStopModel } from './entities/operator-route-stop.model';
import { OperatorRouteModel } from './entities/operator-route.model';
import { OperatorVehicleModel } from './entities/operator-vehicle.model';
import { OperatorModel } from './entities/operator.model';
import { OperatorRoutesService } from './services/operator-routes.service';
import { OperatorsService } from './services/operators.service';

/**
 * First-party operators: businesses that tell us what they run, rather than
 * websites we read.
 *
 * Exports its services so the ingestion pipeline can read published operator
 * routes as just another provider — operator data goes through the same
 * staging, canonical stop resolution and promotion as every scraped source,
 * instead of taking a private path into the rider-facing tables.
 */
@Module({
  imports: [
    SequelizeModule.forFeature([
      OperatorModel,
      OperatorVehicleModel,
      OperatorRouteModel,
      OperatorRouteStopModel,
    ]),
    AuthModule,
  ],
  controllers: [OperatorsController, OperatorRoutesController],
  providers: [OperatorsService, OperatorRoutesService],
  exports: [OperatorsService, OperatorRoutesService],
})
export class OperatorsModule {}
