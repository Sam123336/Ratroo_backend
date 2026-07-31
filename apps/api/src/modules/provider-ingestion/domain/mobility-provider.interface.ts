import { CanonicalMobilityDataset, TransportMode } from './canonical-mobility';

export type ProviderRunStatus =
  | 'PENDING'
  | 'DISCOVERING'
  | 'FETCHING'
  | 'RAW'
  | 'PARSING'
  | 'VALIDATING'
  | 'MAPPING'
  | 'STAGING'
  | 'STAGED'
  | 'PROMOTING'
  | 'ACTIVE'
  | 'RUNNING'
  | 'RAW_SAVED'
  | 'VALIDATED'
  | 'MAPPED'
  | 'PROMOTED'
  | 'FAILED'
  | 'BLOCKED_REQUIRES_PERMISSION';

export interface ProviderRunContext {
  runId: string;
  providerCode: string;
  providerVersion: string;
  startedAt: string;
  checkpoint?: string;
  dryRun?: boolean;
}

export interface ProviderMappingContext {
  runId: string;
  providerCode: string;
  providerVersion: string;
  fetchedAt: string;
}

export interface RawProviderResponse {
  sourceUrl: string;
  fetchedAt: string;
  statusCode?: number;
  contentType?: string;
  body: string | Record<string, unknown>;
  contentHash: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  blockedReason?: string;
}

export interface MobilityProvider<TDiscoveryItem, TRawRecord, TCanonicalRecord> {
  readonly providerCode: string;
  readonly version: string;

  discover(context: ProviderRunContext): AsyncIterable<TDiscoveryItem>;

  fetch(
    item: TDiscoveryItem,
    context: ProviderRunContext,
  ): Promise<RawProviderResponse>;

  parse(response: RawProviderResponse): Promise<TRawRecord[]>;

  validate(records: TRawRecord[]): Promise<ProviderValidationResult>;

  map(
    records: TRawRecord[],
    context: ProviderMappingContext,
  ): Promise<TCanonicalRecord[]>;
}

export interface ProviderRegistryEntry {
  code: string;
  adapterKey: string;
  name: string;
  sourceType:
    | 'GOVERNMENT'
    | 'GOVERNMENT_APP'
    | 'GOVERNMENT_GIS'
    | 'OPERATOR'
    | 'COMMUNITY'
    | 'OPEN_DATA'
    | 'THIRD_PARTY';
  website: string;
  version: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  modes: TransportMode[];
  access: string;
  status:
    | ProviderRunStatus
    | 'PLANNED'
    | 'RESEARCH'
    | 'ACTIVE_DEVELOPMENT'
    | 'RESEARCH_REQUIRED'
    | 'RESEARCH_ONLY'
    | 'RESEARCH_REQUIRES_ACCESS_REVIEW';
  sourceUrls: string[];
  notes: string[];
  canonicalTargets: Array<keyof CanonicalMobilityDataset | string>;
}
