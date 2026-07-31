export type ProviderPipelineStatus =
  | 'DISCOVERED'
  | 'FETCHED'
  | 'RAW_SAVED'
  | 'PARSED'
  | 'VALIDATED'
  | 'MAPPED'
  | 'DATASET_VERSIONED'
  | 'PROMOTION_READY'
  | 'BLOCKED_REQUIRES_PERMISSION'
  | 'FAILED';

export interface WorkerProviderRunContext {
  runId: string;
  providerCode: string;
  providerVersion: string;
  startedAt: string;
  checkpoint?: string;
  dryRun?: boolean;
}

export interface WorkerRawProviderResponse {
  sourceUrl: string;
  fetchedAt: string;
  statusCode?: number;
  contentType?: string;
  body: string | Record<string, unknown>;
  contentHash: string;
  metadata?: Record<string, unknown>;
}

export interface WorkerValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
  blockedReason?: string;
}

export interface WorkerMobilityProvider<TDiscoveryItem, TRawRecord, TCanonicalRecord> {
  readonly providerCode: string;
  readonly version: string;
  discover(context: WorkerProviderRunContext): AsyncIterable<TDiscoveryItem>;
  fetch(item: TDiscoveryItem, context: WorkerProviderRunContext): Promise<WorkerRawProviderResponse>;
  parse(response: WorkerRawProviderResponse): Promise<TRawRecord[]>;
  validate(records: TRawRecord[]): Promise<WorkerValidationResult>;
  map(records: TRawRecord[], context: WorkerProviderRunContext): Promise<TCanonicalRecord[]>;
}

export interface RawSourceSink {
  findLatestContentHash(providerCode: string, sourceUrl: string): Promise<string | null>;
  saveRawSource(
    providerCode: string,
    runId: string,
    response: WorkerRawProviderResponse,
  ): Promise<{ rawRecordId: string }>;
  markItemStatus(input: {
    providerCode: string;
    runId: string;
    externalId: string;
    sourceUrl: string;
    status: 'PENDING' | 'FETCHED' | 'PARSED' | 'MAPPED' | 'FAILED' | 'SKIPPED_UNCHANGED';
    contentHash?: string;
    errorMessage?: string;
  }): Promise<void>;
}

export interface DatasetVersionSink<TCanonicalRecord> {
  persistDatasetVersion(
    providerCode: string,
    runId: string,
    records: TCanonicalRecord[],
  ): Promise<{ datasetVersionId: string }>;
}

export class ProviderIngestionPipeline<TDiscoveryItem, TRawRecord, TCanonicalRecord> {
  constructor(
    private readonly rawSourceSink: RawSourceSink,
    private readonly datasetVersionSink: DatasetVersionSink<TCanonicalRecord>,
  ) {}

  async run(
    provider: WorkerMobilityProvider<TDiscoveryItem, TRawRecord, TCanonicalRecord>,
    context: WorkerProviderRunContext,
  ): Promise<{ status: ProviderPipelineStatus; canonicalCount: number }> {
    let canonicalCount = 0;

    for await (const discoveryItem of provider.discover(context)) {
      const discovered = this.toDiscoveryMetadata(discoveryItem);
      await this.rawSourceSink.markItemStatus({
        providerCode: provider.providerCode,
        runId: context.runId,
        externalId: discovered.externalId,
        sourceUrl: discovered.sourceUrl,
        status: 'PENDING',
      });

      const response = await provider.fetch(discoveryItem, context);
      const latestHash = await this.rawSourceSink.findLatestContentHash(
        provider.providerCode,
        response.sourceUrl,
      );

      if (latestHash === response.contentHash) {
        await this.rawSourceSink.markItemStatus({
          providerCode: provider.providerCode,
          runId: context.runId,
          externalId: discovered.externalId,
          sourceUrl: response.sourceUrl,
          status: 'SKIPPED_UNCHANGED',
          contentHash: response.contentHash,
        });
        continue;
      }

      await this.rawSourceSink.saveRawSource(provider.providerCode, context.runId, response);
      await this.rawSourceSink.markItemStatus({
        providerCode: provider.providerCode,
        runId: context.runId,
        externalId: discovered.externalId,
        sourceUrl: response.sourceUrl,
        status: 'FETCHED',
        contentHash: response.contentHash,
      });

      const rawRecords = await provider.parse(response);
      await this.rawSourceSink.markItemStatus({
        providerCode: provider.providerCode,
        runId: context.runId,
        externalId: discovered.externalId,
        sourceUrl: response.sourceUrl,
        status: 'PARSED',
        contentHash: response.contentHash,
      });

      const validation = await provider.validate(rawRecords);

      if (validation.blockedReason) {
        return { status: 'BLOCKED_REQUIRES_PERMISSION', canonicalCount };
      }

      if (!validation.isValid) {
        return { status: 'FAILED', canonicalCount };
      }

      const canonicalRecords = await provider.map(rawRecords, context);
      canonicalCount += canonicalRecords.length;
      await this.rawSourceSink.markItemStatus({
        providerCode: provider.providerCode,
        runId: context.runId,
        externalId: discovered.externalId,
        sourceUrl: response.sourceUrl,
        status: 'MAPPED',
        contentHash: response.contentHash,
      });

      await this.datasetVersionSink.persistDatasetVersion(
        provider.providerCode,
        context.runId,
        canonicalRecords,
      );
    }

    return { status: 'PROMOTION_READY', canonicalCount };
  }

  private toDiscoveryMetadata(discoveryItem: TDiscoveryItem): { externalId: string; sourceUrl: string } {
    const item = discoveryItem as Record<string, unknown>;
    const sourceUrl = String(item.sourceUrl || item.url || item.href || 'unknown');
    const externalId = String(item.externalId || item.id || sourceUrl);

    return { externalId, sourceUrl };
  }
}
