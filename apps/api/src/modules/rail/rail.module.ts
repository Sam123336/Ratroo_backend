import { Module } from '@nestjs/common';
import { RailwayController } from './controllers/rail.controller';
import { RailwayService } from './services/rail.service';

@Module({
  controllers: [RailwayController],
  providers: [RailwayService],
  exports: [RailwayService],
})
export class RailwayModule {}
