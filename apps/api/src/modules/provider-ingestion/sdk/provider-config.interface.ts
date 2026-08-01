import { TransportMode, SourceType } from '../domain/canonical-mobility';
import { ProviderRunStatus } from '../domain/mobility-provider.interface';

export interface ProviderRateLimitConfig {
  requestsPerSecond?: number;
  concurrentRequests?: number;
  retryAttempts?: number;
  backoffMs?: number;
}

export interface ProviderEndpointConfig {
  name: string;
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  params?: Record<string, string>;
  format: 'HTML' | 'JSON' | 'XML' | 'CSV' | 'GTFS_ZIP' | 'PDF' | 'IMAGE_OCR';
}

export interface ProviderConfig {
  providerCode: string;
  name: string;
  sourceType: SourceType;
  website: string;
  version: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  modes: TransportMode[];
  accessType: string;
  initialStatus: ProviderRunStatus | 'ACTIVE' | 'RESEARCH';
  endpoints: ProviderEndpointConfig[];
  rateLimit?: ProviderRateLimitConfig;
  notes?: string[];
  canonicalTargets: string[];
  geographyScope?: {
    countryCode: 'IN';
    stateCode?: string;
    districts?: string[];
  };
}
