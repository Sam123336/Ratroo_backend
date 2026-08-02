import { Module } from '@nestjs/common';
import { JourneyController } from './controllers/journey.controller';
import { JourneyService } from './services/journey.service';
import { JourneyRepository } from './repositories/journey.repository';

@Module({
  controllers: [JourneyController],
  providers: [JourneyService, JourneyRepository],
  exports: [JourneyService],
})
export class JourneyModule {}
