import { Queue, Worker } from 'bullmq';
import { TRANSIT_QUEUE } from './transit-queue';
import { WorkerConfig } from '../config';
import { ProviderSyncJob, providerSyncPath } from '../jobs/provider-sync-job';

export function createProviderSyncQueue(config: Required<WorkerConfig>) {
  return new Queue<ProviderSyncJob>(TRANSIT_QUEUE, {
    connection: {
      url: config.redisUrl,
    },
  });
}

export function createProviderSyncWorker(config: Required<WorkerConfig>) {
  return new Worker<ProviderSyncJob>(
    TRANSIT_QUEUE,
    async job => {
      const path = providerSyncPath(job.data);
      const response = await fetch(`${config.apiBaseUrl}${path}`, {
        method: 'POST',
        headers: {
          'x-internal-api-key': config.internalApiKey,
        },
      });
      const body = await response.text();

      if (!response.ok) {
        throw new Error(`Provider sync failed with ${response.status}: ${body.slice(0, 500)}`);
      }

      return JSON.parse(body);
    },
    {
      connection: {
        url: config.redisUrl,
      },
      concurrency: Number(process.env.PROVIDER_SYNC_WORKER_CONCURRENCY || 1),
    },
  );
}
