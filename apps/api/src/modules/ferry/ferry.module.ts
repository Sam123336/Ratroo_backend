import { Module } from '@nestjs/common';
import { FerryController } from './controllers/ferry.controller';
import { FerryService } from './services/ferry.service';

@Module({
  controllers: [FerryController],
  providers: [FerryService],
  exports: [FerryService],
})
export class FerryModule {}
