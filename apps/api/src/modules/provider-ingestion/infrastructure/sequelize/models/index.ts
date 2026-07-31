export { DatasetModel } from './dataset.model';
export { DatasetVersionModel } from './dataset-version.model';
export { CanonicalConflictModel } from './canonical-conflict.model';
export { ProviderModel } from './provider.model';
export {
  ProviderAgencyMappingModel,
  ProviderNodeMappingModel,
  ProviderRouteMappingModel,
  ProviderTripMappingModel,
} from './provider-mapping.model';
export { ProviderItemCheckpointModel } from './provider-item-checkpoint.model';
export { ProviderRunModel } from './provider-run.model';
export { ProviderSourceModel } from './provider-source.model';
export { RawSourceRecordModel } from './raw-source-record.model';
export { SourceObservationModel } from './source-observation.model';
export {
  StagedAgencyModel,
  StagedFareModel,
  StagedNodeModel,
  StagedRouteModel,
  StagedRouteStopModel,
  StagedStopTimeModel,
  StagedTripModel,
} from './staged-canonical.model';

import { DatasetModel } from './dataset.model';
import { DatasetVersionModel } from './dataset-version.model';
import { CanonicalConflictModel } from './canonical-conflict.model';
import { ProviderModel } from './provider.model';
import {
  ProviderAgencyMappingModel,
  ProviderNodeMappingModel,
  ProviderRouteMappingModel,
  ProviderTripMappingModel,
} from './provider-mapping.model';
import { ProviderItemCheckpointModel } from './provider-item-checkpoint.model';
import { ProviderRunModel } from './provider-run.model';
import { ProviderSourceModel } from './provider-source.model';
import { RawSourceRecordModel } from './raw-source-record.model';
import { SourceObservationModel } from './source-observation.model';
import {
  StagedAgencyModel,
  StagedFareModel,
  StagedNodeModel,
  StagedRouteModel,
  StagedRouteStopModel,
  StagedStopTimeModel,
  StagedTripModel,
} from './staged-canonical.model';

export const PROVIDER_INGESTION_SEQUELIZE_MODELS = [
  ProviderModel,
  ProviderSourceModel,
  ProviderRunModel,
  ProviderItemCheckpointModel,
  RawSourceRecordModel,
  DatasetModel,
  DatasetVersionModel,
  SourceObservationModel,
  StagedAgencyModel,
  StagedNodeModel,
  StagedRouteModel,
  StagedRouteStopModel,
  StagedTripModel,
  StagedStopTimeModel,
  StagedFareModel,
  ProviderAgencyMappingModel,
  ProviderNodeMappingModel,
  ProviderRouteMappingModel,
  ProviderTripMappingModel,
  CanonicalConflictModel,
];
