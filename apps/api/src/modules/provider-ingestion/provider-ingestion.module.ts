import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { DatasetPromotionService } from './application/DatasetPromotionService';
import { ProviderIngestionQueryService } from './application/ProviderIngestionQueryService';
import { ProviderRegistryService } from './application/ProviderRegistryService';
import { CanonicalConflictsController } from './presentation/controllers/canonical-conflicts.controller';
import { DatasetVersionsController } from './presentation/controllers/dataset-versions.controller';
import { InternalProviderIngestionController } from './presentation/controllers/internal-provider-ingestion.controller';
import { ProviderRegistryController } from './presentation/controllers/provider-registry.controller';
import { ProviderRunsController } from './presentation/controllers/provider-runs.controller';
import { SourceObservationsController } from './presentation/controllers/source-observations.controller';
import { PROVIDER_INGESTION_SEQUELIZE_MODELS } from './infrastructure/sequelize/models';
import { RawSourceRecordRepository } from './infrastructure/sequelize/repositories/RawSourceRecordRepository';

@Module({
  imports: [SequelizeModule.forFeature(PROVIDER_INGESTION_SEQUELIZE_MODELS)],
  controllers: [
    ProviderRegistryController,
    ProviderRunsController,
    DatasetVersionsController,
    SourceObservationsController,
    CanonicalConflictsController,
    InternalProviderIngestionController,
  ],
  providers: [
    ProviderRegistryService,
    ProviderIngestionQueryService,
    DatasetPromotionService,
    RawSourceRecordRepository,
  ],
  exports: [
    ProviderRegistryService,
    ProviderIngestionQueryService,
    DatasetPromotionService,
    RawSourceRecordRepository,
  ],
})
export class ProviderIngestionModule {}
