import { Module } from '@nestjs/common';
import { TramController } from './controllers/tram.controller';
import { TramService } from './services/tram.service';

@Module({
  controllers: [TramController],
  providers: [TramService],
  exports: [TramService],
})
export class TramModule {}
