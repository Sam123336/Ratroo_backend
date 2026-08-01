import { BaseProviderAdapter } from '../sdk/base-provider-adapter';
import { ProviderConfig } from '../sdk/provider-config.interface';
import { CsvFetcher } from '../sdk/fetcher.interface';
import { CsvParser } from '../sdk/parser.interface';
import { StandardProviderValidator } from '../sdk/validator.interface';
import { IMapper } from '../sdk/mapper.interface';
import { CanonicalMobilityDataset } from '../domain/canonical-mobility';
import { ProviderMappingContext } from '../domain/mobility-provider.interface';
import { ensureUuidV7 } from '../../../shared/ids/uuid-v7';

export const CENSUS_INDIA_CONFIG: ProviderConfig = {
  providerCode: 'CENSUS_INDIA',
  name: 'Census of India Administrative Directory',
  sourceType: 'GOVERNMENT',
  website: 'https://censusindia.gov.in',
  version: 'v1',
  priority: 'P0',
  modes: ['ROAD'],
  accessType: 'CSV / Excel Administrative Datasets',
  initialStatus: 'ACTIVE',
  endpoints: [
    { name: 'Village Directory CSV', url: 'https://censusindia.gov.in/villages.csv', format: 'CSV' },
  ],
  notes: [
    'Official Census of India directory providing village codes, district, block, Gram Panchayat, and population stats.',
  ],
  canonicalTargets: ['providers', 'nodes', 'observations'],
};

export class CensusIndiaMapper implements IMapper {
  async map(records: Record<string, unknown>[], context: ProviderMappingContext): Promise<CanonicalMobilityDataset> {
    const nodes = records.map((r, idx) => {
      const villageName = (r.village_name as string) || (r.name as string) || `Village ${idx + 1}`;
      const district = (r.district_name as string) || (r.district as string);
      const block = (r.subdistrict_name as string) || (r.block as string);
      const gp = (r.gram_panchayat as string) || (r.gp as string);
      const lat = typeof r.lat === 'number' ? r.lat : parseFloat((r.lat as string) || '0');
      const lon = typeof r.lon === 'number' ? r.lon : parseFloat((r.lon as string) || '0');

      return {
        externalId: ensureUuidV7(),
        providerCode: 'CENSUS_INDIA',
        nodeType: 'BUS_STOP' as const,
        name: gp ? `${villageName} (${gp} GP)` : villageName,
        normalizedName: villageName.toLowerCase().trim(),
        aliases: [villageName, `${villageName} Village`],
        latitude: Number.isNaN(lat) ? 0 : lat,
        longitude: Number.isNaN(lon) ? 0 : lon,
        geography: {
          countryCode: 'IN' as const,
          stateCode: 'WB',
          district,
          block,
          locality: gp,
        },
        confidence: 0.98,
      };
    });

    return {
      providers: [
        {
          code: 'CENSUS_INDIA',
          name: 'Census of India Administrative Directory',
          sourceType: 'GOVERNMENT',
          website: 'https://censusindia.gov.in',
          version: 'v1',
          transportModes: ['ROAD'],
        },
      ],
      agencies: [],
      nodes,
      routePatterns: [],
      trips: [],
      frequencies: [],
      fares: [],
      observations: [
        {
          providerCode: 'CENSUS_INDIA',
          providerVersion: 'v1',
          sourceUrl: 'https://censusindia.gov.in',
          fetchedAt: context.fetchedAt,
          contentHash: `hash_census_${Date.now()}`,
          rawRecordId: context.runId,
          confidence: 0.98,
          verificationStatus: 'OFFICIAL',
          warnings: [],
        },
      ],
    };
  }
}

export class CensusIndiaProvider extends BaseProviderAdapter {
  readonly config = CENSUS_INDIA_CONFIG;
  readonly fetcher = new CsvFetcher();
  readonly parser = new CsvParser();
  readonly validator = new StandardProviderValidator();
  readonly mapper = new CensusIndiaMapper();
}
