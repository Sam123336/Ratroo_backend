import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { BmrclStaticImportService } from './application/BmrclStaticImportService';
import { BengaluruJourneyPlannerService } from './application/BengaluruJourneyPlannerService';
import { BengaluruMobilityQueryService } from './application/BengaluruMobilityQueryService';
import { BmtcGtfsImportService } from './application/BmtcGtfsImportService';
import { BusNetworkQueryService } from './application/BusNetworkQueryService';
import { DatasetPromotionService } from './application/DatasetPromotionService';
import { GovernmentBusStaticImportService } from './application/GovernmentBusStaticImportService';
import { KolkataMetroStaticImportService } from './application/KolkataMetroStaticImportService';
import { MetroNetworkQueryService } from './application/MetroNetworkQueryService';
import { ProviderIngestionQueryService } from './application/ProviderIngestionQueryService';
import { ProviderRegistryService } from './application/ProviderRegistryService';
import { ProviderSyncSchedulerService } from './application/ProviderSyncSchedulerService';
import { WBBusImportService } from './application/WBBusImportService';
import { BengaluruJourneyController } from './presentation/controllers/bengaluru-journey.controller';
import { BengaluruMobilityController } from './presentation/controllers/bengaluru-mobility.controller';
import { BusNetworkController } from './presentation/controllers/bus-network.controller';
import { CanonicalConflictsController } from './presentation/controllers/canonical-conflicts.controller';
import { DatasetVersionsController } from './presentation/controllers/dataset-versions.controller';
import { DeveloperDashboardController } from './presentation/controllers/developer-dashboard.controller';
import { InternalProviderIngestionController } from './presentation/controllers/internal-provider-ingestion.controller';
import { MetroNetworkController } from './presentation/controllers/metro-network.controller';
import { ProviderRegistryController } from './presentation/controllers/provider-registry.controller';
import { ProviderRunsController } from './presentation/controllers/provider-runs.controller';
import { SourceObservationsController } from './presentation/controllers/source-observations.controller';
import { PROVIDER_INGESTION_SEQUELIZE_MODELS } from './infrastructure/sequelize/models';
import { RawSourceRecordRepository } from './infrastructure/sequelize/repositories/RawSourceRecordRepository';

@Module({
  imports: [SequelizeModule.forFeature(PROVIDER_INGESTION_SEQUELIZE_MODELS)],
  controllers: [
    ProviderRegistryController,
    BengaluruJourneyController,
    BengaluruMobilityController,
    BusNetworkController,
    ProviderRunsController,
    DatasetVersionsController,
    DeveloperDashboardController,
    SourceObservationsController,
    CanonicalConflictsController,
    MetroNetworkController,
    InternalProviderIngestionController,
  ],
  providers: [
    ProviderRegistryService,
    BengaluruJourneyPlannerService,
    BengaluruMobilityQueryService,
    ProviderIngestionQueryService,
    BusNetworkQueryService,
    MetroNetworkQueryService,
    BmrclStaticImportService,
    KolkataMetroStaticImportService,
    BmtcGtfsImportService,
    WBBusImportService,
    GovernmentBusStaticImportService,
    ProviderSyncSchedulerService,
    DatasetPromotionService,
    RawSourceRecordRepository,
  ],
  exports: [
    ProviderRegistryService,
    BengaluruJourneyPlannerService,
    BengaluruMobilityQueryService,
    ProviderIngestionQueryService,
    BusNetworkQueryService,
    MetroNetworkQueryService,
    BmrclStaticImportService,
    KolkataMetroStaticImportService,
    BmtcGtfsImportService,
    WBBusImportService,
    GovernmentBusStaticImportService,
    DatasetPromotionService,
    RawSourceRecordRepository,
  ],
})
export class ProviderIngestionModule {}
