import { assertWorkerConfig, loadWorkerConfig } from './config';
import { createProviderSyncWorker } from './queues/provider-sync-queue';

export async function bootstrap() {
  const config = loadWorkerConfig();
  assertWorkerConfig(config);
  const worker = createProviderSyncWorker(config);

  console.log('[Worker] Transit import worker initialized');
  console.log('[Worker] Queue: transit-import');
  console.log('[Worker] Ingestion policy: enqueue -> worker -> protected provider sync endpoint');

  worker.on('completed', job => {
    console.log(`[Worker] Completed provider sync job ${job.id}`);
  });
  worker.on('failed', (job, error) => {
    console.error(`[Worker] Failed provider sync job ${job?.id}: ${error.message}`);
  });
}

bootstrap().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
