import { CanonicalMobilityDataset } from '../domain/canonical-mobility';
import { ProviderMappingContext } from '../domain/mobility-provider.interface';

export interface IMapper<TRawRecord = Record<string, unknown>> {
  map(records: TRawRecord[], context: ProviderMappingContext): Promise<CanonicalMobilityDataset>;
}
