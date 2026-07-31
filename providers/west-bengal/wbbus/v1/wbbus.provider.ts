import {
  MobilityProvider,
  ProviderMappingContext,
  ProviderRunContext,
  ProviderValidationResult,
  RawProviderResponse,
} from '../../../../apps/api/src/modules/provider-ingestion/domain/mobility-provider.interface';
import { WBBusClient } from './wbbus.client';
import { WBBusDiscovery } from './wbbus.discovery';
import { WBBusMapper, WBBusCanonicalOutput } from './wbbus.mapper';
import { WBBusParser } from './wbbus.parser';
import { WBBusRawBus, WBBusDiscoveryItem } from './wbbus.types';
import { WBBusValidator } from './wbbus.validator';

export class WBBusProvider implements MobilityProvider<WBBusDiscoveryItem, WBBusRawBus, WBBusCanonicalOutput> {
  readonly providerCode = 'WBBUS';
  readonly version = 'v1';

  constructor(
    private readonly discovery = new WBBusDiscovery(),
    private readonly client = new WBBusClient(),
    private readonly parser = new WBBusParser(),
    private readonly validator = new WBBusValidator(),
    private readonly mapper = new WBBusMapper(),
  ) {}

  discover(_context: ProviderRunContext): AsyncIterable<WBBusDiscoveryItem> {
    return this.discovery.discoverSeedPages(10);
  }

  async fetch(item: WBBusDiscoveryItem): Promise<RawProviderResponse> {
    return this.client.fetchHtml(item.sourceUrl);
  }

  async parse(response: RawProviderResponse): Promise<WBBusRawBus[]> {
    return [this.parser.parseBusHtml(response.sourceUrl, String(response.body))];
  }

  async validate(records: WBBusRawBus[]): Promise<ProviderValidationResult> {
    return this.validator.validate(records);
  }

  async map(records: WBBusRawBus[], _context: ProviderMappingContext): Promise<WBBusCanonicalOutput[]> {
    return [this.mapper.map(records)];
  }
}

