import { BaseProviderAdapter } from '../sdk/base-provider-adapter';
import { ProviderConfig } from '../sdk/provider-config.interface';
import { JsonFetcher } from '../sdk/fetcher.interface';
import { JsonParser } from '../sdk/parser.interface';
import { StandardProviderValidator } from '../sdk/validator.interface';
import { IMapper } from '../sdk/mapper.interface';
import { CanonicalMobilityDataset, NodeType } from '../domain/canonical-mobility';
import { ProviderMappingContext, RawProviderResponse } from '../domain/mobility-provider.interface';
import { ensureUuidV7 } from '../../../shared/ids/uuid-v7';

export const OPENSTREETMAP_CONFIG: ProviderConfig = {
  providerCode: 'OPENSTREETMAP',
  name: 'OpenStreetMap Global Spatial Network',
  sourceType: 'OPEN_DATA',
  website: 'https://www.openstreetmap.org',
  version: 'v1',
  priority: 'P0',
  modes: ['BUS', 'METRO', 'SUBURBAN_RAIL', 'TRAM', 'FERRY', 'WALKING', 'ROAD'],
  accessType: 'Overpass API JSON',
  initialStatus: 'ACTIVE',
  endpoints: [
    { name: 'Overpass Transport Query', url: 'https://overpass-api.de/api/interpreter?data=[out:json];node[highway=bus_stop](22.5,88.3,22.6,88.4);out%2020;', format: 'JSON' },
  ],
  canonicalTargets: ['providers', 'nodes', 'observations'],
};

export class OpenStreetMapFetcher extends JsonFetcher {
  async fetch(url: string, options?: Record<string, unknown>): Promise<RawProviderResponse> {
    const fetchedAt = new Date().toISOString();
    try {
      const overpassUrl = 'https://overpass-api.de/api/interpreter?data=[out:json];node[highway=bus_stop](22.5,88.3,22.6,88.4);out%2020;';
      const res = await fetch(overpassUrl, {
        headers: { 'User-Agent': 'RatrooBot/1.0 (WestBengalTransport)' },
      });
      const body = await res.json();
      return {
        sourceUrl: overpassUrl,
        fetchedAt,
        statusCode: res.status,
        contentType: 'application/json',
        body,
        contentHash: `hash_osm_${Date.now()}`,
        metadata: options?.metadata as Record<string, unknown> || {},
      };
    } catch {
      return super.fetch(url, options);
    }
  }
}

export class OpenStreetMapMapper implements IMapper {
  async map(records: Record<string, unknown>[], context: ProviderMappingContext): Promise<CanonicalMobilityDataset> {
    let elements: any[] = [];
    if (records.length > 0 && Array.isArray((records[0] as any).elements)) {
      elements = (records[0] as any).elements;
    } else {
      elements = records;
    }

    const nodes = elements.map((r, idx) => {
      const tags = (r.tags as Record<string, string>) || {};
      let nodeType: NodeType = 'BUS_STOP';
      if (tags.highway === 'bus_stop' || tags.public_transport === 'platform') nodeType = 'BUS_STOP';
      else if (tags.railway === 'station') nodeType = 'RAILWAY_STATION';
      else if (tags.station === 'subway' || tags.railway === 'subway_entrance') nodeType = 'METRO_STATION';
      else if (tags.amenity === 'ferry_terminal') nodeType = 'FERRY_TERMINAL';
      else if (tags.railway === 'tram_stop') nodeType = 'TRAM_STOP';

      const lat = typeof r.lat === 'number' ? r.lat : 22.5726;
      const lon = typeof r.lon === 'number' ? r.lon : 88.3639;
      const name = tags.name || tags['name:en'] || (r.name as string) || `OSM Stop ${r.id || idx + 1}`;

      return {
        externalId: ensureUuidV7(),
        providerCode: 'OPENSTREETMAP',
        nodeType,
        name,
        normalizedName: name.toLowerCase().trim(),
        aliases: [tags['name:bn'], tags.alt_name].filter(Boolean) as string[],
        latitude: lat,
        longitude: lon,
        geography: {
          countryCode: 'IN' as const,
          stateCode: 'WB',
          district: 'Kolkata',
        },
        confidence: 0.95,
      };
    });

    return {
      providers: [
        {
          code: 'OPENSTREETMAP',
          name: 'OpenStreetMap Global Spatial Network',
          sourceType: 'OPEN_DATA',
          website: 'https://www.openstreetmap.org',
          version: 'v1',
          transportModes: ['BUS', 'METRO', 'SUBURBAN_RAIL', 'TRAM', 'FERRY', 'WALKING', 'ROAD'],
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
          providerCode: 'OPENSTREETMAP',
          providerVersion: 'v1',
          sourceUrl: 'https://www.openstreetmap.org',
          fetchedAt: context.fetchedAt,
          contentHash: `hash_osm_${Date.now()}`,
          rawRecordId: context.runId,
          confidence: 0.95,
          verificationStatus: 'OFFICIAL',
          warnings: [],
        },
      ],
    };
  }
}

export class OpenStreetMapProvider extends BaseProviderAdapter {
  readonly config = OPENSTREETMAP_CONFIG;
  readonly fetcher = new OpenStreetMapFetcher();
  readonly parser = new JsonParser();
  readonly validator = new StandardProviderValidator();
  readonly mapper = new OpenStreetMapMapper();
}
