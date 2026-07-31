import {
  MobilityProvider,
  ProviderMappingContext,
  ProviderRunContext,
  ProviderValidationResult,
  RawProviderResponse,
} from '../../../../../apps/api/src/modules/provider-ingestion/domain/mobility-provider.interface';
import { BmrclClient } from './bmrcl.client';
import { BmrclDiscovery } from './bmrcl.discovery';
import { BmrclStaticNetworkMapper, BmrclCanonicalOutput } from './bmrcl.mapper';
import { BmrclStaticNetworkParser } from './bmrcl.parser';
import { BmrclDiscoveryItem, BmrclParsedNetwork, BmrclRawPage } from './bmrcl.types';
import { BmrclStaticNetworkValidator } from './bmrcl.validator';

export class BmrclProvider implements MobilityProvider<BmrclDiscoveryItem, BmrclParsedNetwork, BmrclCanonicalOutput> {
  readonly providerCode = 'BMRCL';
  readonly version = 'v1';

  constructor(
    private readonly discovery = new BmrclDiscovery(),
    private readonly client = new BmrclClient(),
    private readonly parser = new BmrclStaticNetworkParser(),
    private readonly validator = new BmrclStaticNetworkValidator(),
    private readonly mapper = new BmrclStaticNetworkMapper(),
  ) {}

  discover(_context: ProviderRunContext): AsyncIterable<BmrclDiscoveryItem> {
    return this.discovery.discoverStaticNetwork();
  }

  async fetch(item: BmrclDiscoveryItem): Promise<RawProviderResponse> {
    return this.client.fetchHtml(item.sourceUrl, { sourceRole: item.sourceRole });
  }

  async parse(response: RawProviderResponse): Promise<BmrclParsedNetwork[]> {
    const rawPage: BmrclRawPage = {
      sourceUrl: response.sourceUrl,
      sourceRole: (response.metadata?.sourceRole as BmrclRawPage['sourceRole']) || 'NETWORK',
      html: String(response.body),
      fetchedAt: response.fetchedAt,
    };

    const parsed = this.parser.parse([rawPage]);
    parsed.contentHash = response.contentHash;
    parsed.rawRecordId = response.sourceUrl;

    return [parsed];
  }

  async validate(records: BmrclParsedNetwork[]): Promise<ProviderValidationResult> {
    const validation = this.validator.validate(records[0]);
    return validation;
  }

  async map(records: BmrclParsedNetwork[], context: ProviderMappingContext): Promise<BmrclCanonicalOutput[]> {
    return [this.mapper.map(records[0])];
  }
}
