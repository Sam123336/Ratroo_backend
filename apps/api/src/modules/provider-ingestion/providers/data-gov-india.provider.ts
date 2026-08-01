import { BaseProviderAdapter } from '../sdk/base-provider-adapter';
import { ProviderConfig } from '../sdk/provider-config.interface';
import { JsonFetcher } from '../sdk/fetcher.interface';
import { JsonParser } from '../sdk/parser.interface';
import { StandardProviderValidator } from '../sdk/validator.interface';
import { IMapper } from '../sdk/mapper.interface';
import { CanonicalMobilityDataset } from '../domain/canonical-mobility';
import { ProviderMappingContext } from '../domain/mobility-provider.interface';

export const DATA_GOV_INDIA_CONFIG: ProviderConfig = {
  providerCode: 'DATA_GOV_INDIA',
  name: 'Open Government Data India (data.gov.in)',
  sourceType: 'OPEN_DATA',
  website: 'https://data.gov.in',
  version: 'v1',
  priority: 'P1',
  modes: ['BUS', 'METRO', 'SUBURBAN_RAIL', 'FERRY', 'ROAD'],
  accessType: 'REST JSON / CSV Datasets',
  initialStatus: 'ACTIVE',
  endpoints: [
    { name: 'Transport Infrastructure Dataset', url: 'https://api.data.gov.in/resource/transport', format: 'JSON' },
  ],
  notes: [
    'Official Open Government Data portal providing GIS datasets, administrative boundaries, transport datasets, and public infrastructure records.',
  ],
  canonicalTargets: ['providers', 'agencies', 'nodes', 'observations'],
};

export class DataGovIndiaMapper implements IMapper {
  async map(records: Record<string, unknown>[], context: ProviderMappingContext): Promise<CanonicalMobilityDataset> {
    return {
      providers: [
        {
          code: 'DATA_GOV_INDIA',
          name: 'Open Government Data India (data.gov.in)',
          sourceType: 'OPEN_DATA',
          website: 'https://data.gov.in',
          version: 'v1',
          transportModes: ['BUS', 'METRO', 'SUBURBAN_RAIL', 'FERRY', 'ROAD'],
        },
      ],
      agencies: [],
      nodes: records.map((r, idx) => ({
        externalId: `datagov_${r.id || idx + 1}`,
        providerCode: 'DATA_GOV_INDIA',
        nodeType: 'BUS_STOP',
        name: (r.title as string) || (r.facility_name as string) || `OGD Infrastructure ${idx + 1}`,
        normalizedName: ((r.title as string) || (r.facility_name as string) || `OGD Infrastructure ${idx + 1}`)
          .toLowerCase()
          .trim(),
        aliases: [],
        latitude: typeof r.latitude === 'number' ? r.latitude : 22.57,
        longitude: typeof r.longitude === 'number' ? r.longitude : 88.36,
        geography: { countryCode: 'IN', stateCode: 'WB' },
        confidence: 0.90,
      })),
      routePatterns: [],
      trips: [],
      frequencies: [],
      fares: [],
      observations: [
        {
          providerCode: 'DATA_GOV_INDIA',
          providerVersion: 'v1',
          sourceUrl: 'https://data.gov.in',
          fetchedAt: context.fetchedAt,
          contentHash: 'hash_datagov_v1',
          rawRecordId: context.runId,
          confidence: 0.90,
          verificationStatus: 'OFFICIAL',
          warnings: [],
        },
      ],
    };
  }
}

export class DataGovIndiaProvider extends BaseProviderAdapter {
  readonly config = DATA_GOV_INDIA_CONFIG;
  readonly fetcher = new JsonFetcher();
  readonly parser = new JsonParser();
  readonly validator = new StandardProviderValidator();
  readonly mapper = new DataGovIndiaMapper();
}
