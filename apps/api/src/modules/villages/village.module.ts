import { Module } from '@nestjs/common';
import { VillageController } from './controllers/village.controller';
import { VillageService } from './services/village.service';
import { VillageRepository } from './repositories/village.repository';
import { NearbyModule } from '../nearby/nearby.module';

@Module({
  imports: [NearbyModule],
  controllers: [VillageController],
  providers: [VillageService, VillageRepository],
  exports: [VillageService],
})
export class VillageModule {}
