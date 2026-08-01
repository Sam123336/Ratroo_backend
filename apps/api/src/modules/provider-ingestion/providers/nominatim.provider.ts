import { BaseProviderAdapter } from '../sdk/base-provider-adapter';
import { ProviderConfig } from '../sdk/provider-config.interface';
import { JsonFetcher } from '../sdk/fetcher.interface';
import { JsonParser } from '../sdk/parser.interface';
import { StandardProviderValidator } from '../sdk/validator.interface';
import { IMapper } from '../sdk/mapper.interface';
import { CanonicalMobilityDataset } from '../domain/canonical-mobility';
import { ProviderMappingContext, RawProviderResponse } from '../domain/mobility-provider.interface';
import { ensureUuidV7 } from '../../../shared/ids/uuid-v7';

export const NOMINATIM_CONFIG: ProviderConfig = {
  providerCode: 'NOMINATIM',
  name: 'Nominatim Geocoding & Village Resolution',
  sourceType: 'OPEN_DATA',
  website: 'https://nominatim.openstreetmap.org',
  version: 'v1',
  priority: 'P0',
  modes: ['ROAD', 'BUS', 'WALKING'],
  accessType: 'REST JSON API',
  initialStatus: 'ACTIVE',
  endpoints: [
    { name: 'Search Transport Nodes', url: 'https://nominatim.openstreetmap.org/search?q=West+Bengal+Bus+Stop&format=json&addressdetails=1', format: 'JSON' },
  ],
  canonicalTargets: ['providers', 'nodes', 'observations'],
};

export class NominatimFetcher extends JsonFetcher {
  async fetch(url: string, options?: Record<string, unknown>): Promise<RawProviderResponse> {
    const fetchedAt = new Date().toISOString();
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'YatrooBot/1.0 (WestBengalTransport)' },
      });
      const body = await res.json();
      return {
        sourceUrl: url,
        fetchedAt,
        statusCode: res.status,
        contentType: 'application/json',
        body,
        contentHash: `hash_nominatim_${Date.now()}`,
        metadata: options?.metadata as Record<string, unknown> || {},
      };
    } catch {
      return super.fetch(url, options);
    }
  }
}

export class NominatimMapper implements IMapper {
  async map(records: Record<string, unknown>[], context: ProviderMappingContext): Promise<CanonicalMobilityDataset> {
    let items: any[] = [];
    records.forEach((r) => {
      if (Array.isArray(r)) items = items.concat(r);
      else if (r && typeof r === 'object' && !Array.isArray(r)) items.push(r);
    });

    const nodes = items.map((r, idx) => {
      const address = (r.address as Record<string, string>) || {};
      const lat = parseFloat(r.lat as string);
      const lon = parseFloat(r.lon as string);
      const displayName = (r.display_name as string) || (r.name as string) || `Nominatim Place ${idx + 1}`;

      return {
        externalId: ensureUuidV7(),
        providerCode: 'NOMINATIM',
        nodeType: 'BUS_STOP' as const,
        name: displayName,
        normalizedName: displayName.toLowerCase().trim(),
        aliases: [address.village, address.town, address.suburb, address.healthcare].filter(Boolean) as string[],
        latitude: Number.isNaN(lat) ? 0 : lat,
        longitude: Number.isNaN(lon) ? 0 : lon,
        geography: {
          countryCode: 'IN' as const,
          stateCode: address['ISO3166-2-lvl4']?.replace('IN-', '') || 'WB',
          district: address.state_district || address.county,
          block: address.county,
          city: address.city || address.town || address.village,
        },
        confidence: 0.92,
      };
    });

    return {
      providers: [
        {
          code: 'NOMINATIM',
          name: 'Nominatim Geocoding & Village Resolution',
          sourceType: 'OPEN_DATA',
          website: 'https://nominatim.openstreetmap.org',
          version: 'v1',
          transportModes: ['ROAD', 'BUS', 'WALKING'],
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
          providerCode: 'NOMINATIM',
          providerVersion: 'v1',
          sourceUrl: 'https://nominatim.openstreetmap.org',
          fetchedAt: context.fetchedAt,
          contentHash: `hash_nominatim_${Date.now()}`,
          rawRecordId: context.runId,
          confidence: 0.92,
          verificationStatus: 'OFFICIAL',
          warnings: [],
        },
      ],
    };
  }
}

export class NominatimProvider extends BaseProviderAdapter {
  readonly config = NOMINATIM_CONFIG;
  readonly fetcher = new NominatimFetcher();
  readonly parser = new JsonParser();
  readonly validator = new StandardProviderValidator();
  readonly mapper = new NominatimMapper();
}
