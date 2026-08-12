import { Module } from '@nestjs/common';
import { GetRegionUseCase } from './services/GetRegionUseCase';
import { ListRegionsUseCase } from './services/ListRegionsUseCase';
import { RegionRegistryService } from './services/RegionRegistryService';
import { CoverageController } from './controllers/coverage.controller';

@Module({
  controllers: [CoverageController],
  providers: [RegionRegistryService, ListRegionsUseCase, GetRegionUseCase],
  exports: [RegionRegistryService],
})
export class RegionsModule {}
