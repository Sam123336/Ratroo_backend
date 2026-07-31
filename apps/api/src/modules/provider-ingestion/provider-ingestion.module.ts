import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ProviderRegistryService } from './application/ProviderRegistryService';
import { ProviderRegistryController } from './presentation/controllers/provider-registry.controller';
import { PROVIDER_INGESTION_SEQUELIZE_MODELS } from './infrastructure/sequelize/models';
import { RawSourceRecordRepository } from './infrastructure/sequelize/repositories/RawSourceRecordRepository';

@Module({
  imports: [SequelizeModule.forFeature(PROVIDER_INGESTION_SEQUELIZE_MODELS)],
  controllers: [ProviderRegistryController],
  providers: [ProviderRegistryService, RawSourceRecordRepository],
  exports: [ProviderRegistryService, RawSourceRecordRepository],
})
export class ProviderIngestionModule {}

