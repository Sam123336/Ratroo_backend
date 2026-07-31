export { DatasetModel } from './dataset.model';
export { DatasetVersionModel } from './dataset-version.model';
export { ProviderModel } from './provider.model';
export { ProviderRunModel } from './provider-run.model';
export { ProviderSourceModel } from './provider-source.model';
export { RawSourceRecordModel } from './raw-source-record.model';
export { SourceObservationModel } from './source-observation.model';

import { DatasetModel } from './dataset.model';
import { DatasetVersionModel } from './dataset-version.model';
import { ProviderModel } from './provider.model';
import { ProviderRunModel } from './provider-run.model';
import { ProviderSourceModel } from './provider-source.model';
import { RawSourceRecordModel } from './raw-source-record.model';
import { SourceObservationModel } from './source-observation.model';

export const PROVIDER_INGESTION_SEQUELIZE_MODELS = [
  ProviderModel,
  ProviderSourceModel,
  ProviderRunModel,
  RawSourceRecordModel,
  DatasetModel,
  DatasetVersionModel,
  SourceObservationModel,
];
