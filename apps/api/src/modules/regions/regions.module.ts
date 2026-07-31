import { Module } from '@nestjs/common';
import { GetRegionUseCase } from './application/GetRegionUseCase';
import { ListRegionsUseCase } from './application/ListRegionsUseCase';
import { RegionRegistryService } from './application/RegionRegistryService';
import { CoverageController } from './presentation/controllers/coverage.controller';

@Module({
  controllers: [CoverageController],
  providers: [RegionRegistryService, ListRegionsUseCase, GetRegionUseCase],
  exports: [RegionRegistryService],
})
export class RegionsModule {}
