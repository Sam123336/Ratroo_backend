export interface ProviderSyncJob {
  providerCode: string;
  runType: 'FULL' | 'INCREMENTAL';
  options?: {
    maxPages?: number;
    maxItems?: number;
    maxRoutePatterns?: number;
    includeTrips?: boolean;
  };
}

export function providerSyncPath(job: ProviderSyncJob) {
  const params = new URLSearchParams();

  if (job.options?.maxPages) {
    params.set('maxPages', String(job.options.maxPages));
  }
  if (job.options?.maxItems) {
    params.set('maxItems', String(job.options.maxItems));
  }
  if (job.options?.maxRoutePatterns) {
    params.set('maxRoutePatterns', String(job.options.maxRoutePatterns));
  }
  if (job.options?.includeTrips !== undefined) {
    params.set('includeTrips', String(job.options.includeTrips));
  }

  const query = params.toString();
  return `/internal/providers/${encodeURIComponent(job.providerCode)}/sync${query ? `?${query}` : ''}`;
}
