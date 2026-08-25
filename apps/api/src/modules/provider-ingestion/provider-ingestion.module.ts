import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { BmrclStaticImportService } from './application/BmrclStaticImportService';
import { BengaluruJourneyPlannerService } from './application/BengaluruJourneyPlannerService';
import { BengaluruMobilityQueryService } from './application/BengaluruMobilityQueryService';
import { BmtcGtfsImportService } from './application/BmtcGtfsImportService';
import { BusNetworkQueryService } from './application/BusNetworkQueryService';
import { DatasetPromotionService } from './application/DatasetPromotionService';
import { BmtcStaticImportService } from './application/BmtcStaticImportService';
import { GovernmentBusStaticImportService } from './application/GovernmentBusStaticImportService';
import { KolkataMetroStaticImportService } from './application/KolkataMetroStaticImportService';
import { MetroNetworkQueryService } from './application/MetroNetworkQueryService';
import { ProviderIngestionQueryService } from './application/ProviderIngestionQueryService';
import { ProviderRegistryService } from './application/ProviderRegistryService';
import { ProviderSyncSchedulerService } from './application/ProviderSyncSchedulerService';
import { ProviderSyncQueueService } from './application/ProviderSyncQueueService';
import { CanonicalTransitProjectionService } from './application/CanonicalTransitProjectionService';
import { ProviderSyncCronController } from './presentation/controllers/provider-sync-cron.controller';
import { WBBusImportService } from './application/WBBusImportService';
import { GenericProviderIngestionService } from './application/GenericProviderIngestionService';

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

// Target Providers
import { BmtcOfficialProvider } from './providers/bmtc/bmtc-official.provider';
import { WBBusProvider } from './providers/wbbus.provider';
import { WBBustimeProvider } from './providers/wbbustime.provider';
import { BusSathiProvider } from './providers/bussathi.provider';
import { OpenStreetMapProvider } from './providers/openstreetmap.provider';
import { NominatimProvider } from './providers/nominatim.provider';
import { CensusIndiaProvider } from './providers/census-india.provider';
import { DataGovIndiaProvider } from './providers/data-gov-india.provider';

// Engines & Geocoders
import { StopEnrichmentEngine } from './enrichment/stop-enrichment.engine';
import { RouteEnrichmentEngine } from './enrichment/route-enrichment.engine';
import { ConfidenceScoringEngine } from './enrichment/confidence-scoring.engine';
import { PluggableGeocoderEngine } from './geocoding/pluggable-geocoder.engine';
import { DataQualityEnrichmentEngine } from './enrichment/data-quality-enrichment.engine';
import { StopDeduplicationService } from './enrichment/stop-deduplication.service';
import { DataQualityGateService } from './enrichment/data-quality-gate.service';
import { GeocodingAliasService } from './geocoding/geocoding-alias.service';
import { CanonicalStopResolutionEngine } from './enrichment/canonical-stop-resolution.engine';

// Health & Dashboard
import { ProviderHealthService } from './health/provider-health.service';
import { ProviderDashboardController } from './health/provider-dashboard.controller';
import { CoverageDashboardService } from './health/coverage-dashboard.service';
import { MetroStationLocatorService } from './application/MetroStationLocatorService';
import { LiveVehicleService } from './application/LiveVehicleService';

// Removed Places & Graph imports

import { InternalOpsDashboardController } from './health/internal-ops-dashboard.controller';
import { LiveVehiclesController } from './presentation/controllers/live-vehicles.controller';
import { OperatorRouteModel } from '../operators/entities/operator-route.model';
import { OperatorModel } from '../operators/entities/operator.model';
import { OperatorRouteStopModel } from '../operators/entities/operator-route-stop.model';
import { OperatorVehicleModel } from '../operators/entities/operator-vehicle.model';
import {
  AgencyModel, RouteModel, StopModel, StopTimeModel, TripModel,
} from '../transit/infrastructure/sequelize/models';
import {
  OperatorSubmissionFetcher,
  OperatorSubmittedProvider,
} from './providers/operator-submitted.provider';

@Module({
  imports: [
    SequelizeModule.forFeature(PROVIDER_INGESTION_SEQUELIZE_MODELS),
    // The operator provider reads submitted routes; it needs the model, not
    // the operators module's services, so only the model is pulled in.
    SequelizeModule.forFeature([
      OperatorModel,
      OperatorVehicleModel,
      OperatorRouteModel,
      OperatorRouteStopModel,
    ]),
    // The projection writes the transit serving tables through their own
    // models, so they have to be injectable here too.
    SequelizeModule.forFeature([
      AgencyModel,
      StopModel,
      RouteModel,
      TripModel,
      StopTimeModel,
    ]),
  ],
  controllers: [
    LiveVehiclesController,
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
    ProviderDashboardController,
    InternalOpsDashboardController,
    ProviderSyncCronController,
  ],
  providers: [
    MetroStationLocatorService,
    LiveVehicleService,
    // Registered operators, read through the same pipeline as every
    // scraped source rather than a private path into the transit tables.
    OperatorSubmissionFetcher,
    OperatorSubmittedProvider,
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
    BmtcStaticImportService,
    GovernmentBusStaticImportService,
    ProviderSyncSchedulerService,
    ProviderSyncQueueService,
    CanonicalTransitProjectionService,
    DatasetPromotionService,
    GenericProviderIngestionService,
    RawSourceRecordRepository,

    // Target Providers
    BmtcOfficialProvider,
    WBBusProvider,
    WBBustimeProvider,
    BusSathiProvider,
    OpenStreetMapProvider,
    NominatimProvider,
    CensusIndiaProvider,
    DataGovIndiaProvider,

    // Engines & Services
    StopEnrichmentEngine,
    RouteEnrichmentEngine,
    ConfidenceScoringEngine,
    PluggableGeocoderEngine,
    GeocodingAliasService,
    DataQualityEnrichmentEngine,
    StopDeduplicationService,
    DataQualityGateService,
    CanonicalStopResolutionEngine,
    ProviderHealthService,
    CoverageDashboardService,
  ],
  exports: [
    MetroStationLocatorService,
    LiveVehicleService,
    ProviderSyncSchedulerService,
    CanonicalTransitProjectionService,
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
    BmtcStaticImportService,
    GovernmentBusStaticImportService,
    DatasetPromotionService,
    GenericProviderIngestionService,
    RawSourceRecordRepository,

    // Target Providers
    BmtcOfficialProvider,
    WBBusProvider,
    WBBustimeProvider,
    BusSathiProvider,
    OpenStreetMapProvider,
    NominatimProvider,
    CensusIndiaProvider,
    DataGovIndiaProvider,

    // Engines & Services
    StopEnrichmentEngine,
    RouteEnrichmentEngine,
    ConfidenceScoringEngine,
    PluggableGeocoderEngine,
    GeocodingAliasService,
    StopDeduplicationService,
    DataQualityGateService,
    CanonicalStopResolutionEngine,
    ProviderHealthService,
    CoverageDashboardService,
  ],
})
export class ProviderIngestionModule {}
