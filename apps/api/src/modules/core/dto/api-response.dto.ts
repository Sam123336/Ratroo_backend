export interface ProviderProvenanceDto {
  provider: string;
  providerName?: string;
  providerEntityId?: string;
  providerUrl?: string;
  providerRouteId?: string;
  datasetVersion?: string;
  parserVersion?: string;
  crawlTimestamp?: string;
  confidence: number;
  sourceObservationId?: string;
}

export interface DeepLinkDto {
  provider: string;
  title: string;
  url: string;
}

export interface QualityMetadataDto {
  coordinateConfidence?: number;
  routeConfidence?: number;
  timetableConfidence?: number;
  fareConfidence?: number;
  operatorConfidence?: number;
  overallConfidence: number;
}

export interface SyncMetadataDto {
  lastSync: string;
  nextScheduledSync?: string;
  datasetVersion?: string;
  providerVersion?: string;
}

export interface ApiMetadataDto {
  canonicalPlaceId?: string;
  confidenceScore: number;
  lastUpdated?: string;
  lastSyncTimestamp: string;
  providerCount: number;
  providers: string[];
  providerProvenance: ProviderProvenanceDto[];
  deepLinks: DeepLinkDto[];
  dataSources?: string[];
  quality?: QualityMetadataDto;
  sync?: SyncMetadataDto;
}

/**
 * Global API Response Wrapper
 */
export class ApiResponseDto<T> {
  success: boolean;
  data: T;
  metadata: ApiMetadataDto;
}

/**
 * A wrapper class that internal Services can return to explicitly pass metadata up to the controller/interceptor.
 */
export class ApiResult<T> {
  constructor(
    public readonly data: T,
    public readonly metadata: Partial<ApiMetadataDto> = {}
  ) {}
}
