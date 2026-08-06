import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';

/** Must match apps/worker/src/queues/transit-queue.ts. */
const TRANSIT_QUEUE = 'transit-import';

/**
 * Producer side of the ingestion queue. The worker (apps/worker) consumes these
 * and calls back into /internal/providers/:code/sync.
 *
 * Without REDIS_URL this is a no-op that reports `queued: false` — callers fall
 * back to running the sync inline, which is fine on a long-lived host and wrong
 * on serverless (the function dies when the response returns).
 */
@Injectable()
export class ProviderSyncQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(ProviderSyncQueueService.name);
  private queue?: Queue;

  get available() {
    return Boolean(process.env.REDIS_URL);
  }

  async enqueueAll(providerCodes: string[], trigger: string) {
    if (!this.available) {
      return { queued: false as const, reason: 'REDIS_URL not configured', providerCodes };
    }

    const queue = this.getQueue();
    const jobs = await Promise.all(
      providerCodes.map(providerCode =>
        queue.add(
          `provider-sync:${providerCode}`,
          { providerCode, runType: 'FULL' },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 30_000 },
            removeOnComplete: 100,
            removeOnFail: 200,
            // One job per provider per day — a retried cron hit won't double-import.
            jobId: `${trigger}:${providerCode}:${new Date().toISOString().slice(0, 10)}`,
          },
        ),
      ),
    );

    this.logger.log(`Enqueued ${jobs.length} provider sync job(s) from ${trigger}.`);
    return { queued: true as const, jobIds: jobs.map(job => job.id), providerCodes };
  }

  private getQueue() {
    this.queue ??= new Queue(TRANSIT_QUEUE, { connection: { url: process.env.REDIS_URL! } });
    return this.queue;
  }

  async onModuleDestroy() {
    await this.queue?.close();
  }
}
