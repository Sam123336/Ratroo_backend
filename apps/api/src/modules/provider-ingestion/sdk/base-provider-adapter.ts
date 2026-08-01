import {
  MobilityProvider,
  ProviderRunContext,
  ProviderMappingContext,
  RawProviderResponse,
  ProviderValidationResult,
} from '../domain/mobility-provider.interface';
import { CanonicalMobilityDataset } from '../domain/canonical-mobility';
import { ProviderConfig } from './provider-config.interface';
import { IFetcher } from './fetcher.interface';
import { IParser } from './parser.interface';
import { IValidator } from './validator.interface';
import { IMapper } from './mapper.interface';

export abstract class BaseProviderAdapter<
  TDiscoveryItem = Record<string, unknown>,
  TRawRecord = Record<string, unknown>
> implements MobilityProvider<TDiscoveryItem, TRawRecord, CanonicalMobilityDataset> {
  abstract readonly config: ProviderConfig;
  abstract readonly fetcher: IFetcher;
  abstract readonly parser: IParser<TRawRecord>;
  abstract readonly validator: IValidator<TRawRecord>;
  abstract readonly mapper: IMapper<TRawRecord>;

  get providerCode(): string {
    return this.config.providerCode;
  }

  get version(): string {
    return this.config.version;
  }

  async *discover(context: ProviderRunContext): AsyncIterable<TDiscoveryItem> {
    for (const endpoint of this.config.endpoints) {
      yield {
        url: endpoint.url,
        format: endpoint.format,
        name: endpoint.name,
        contextRunId: context.runId,
      } as unknown as TDiscoveryItem;
    }
  }

  async fetch(item: TDiscoveryItem, context: ProviderRunContext): Promise<RawProviderResponse> {
    const discoveryItem = item as Record<string, unknown>;
    const targetUrl = (discoveryItem?.url as string) || this.config.website;
    return this.fetcher.fetch(targetUrl, { context });
  }

  async parse(response: RawProviderResponse): Promise<TRawRecord[]> {
    return this.parser.parse(response);
  }

  async validate(records: TRawRecord[]): Promise<ProviderValidationResult> {
    return this.validator.validate(records);
  }

  async map(records: TRawRecord[], context: ProviderMappingContext): Promise<CanonicalMobilityDataset[]> {
    const dataset = await this.mapper.map(records, context);
    return [dataset];
  }
}
