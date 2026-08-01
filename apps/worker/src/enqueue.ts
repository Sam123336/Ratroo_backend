import { assertWorkerConfig, loadWorkerConfig } from './config';
import { ProviderSyncJob } from './jobs/provider-sync-job';
import { createProviderSyncQueue } from './queues/provider-sync-queue';

function parseOptions(args: string[]): ProviderSyncJob['options'] {
  const options: NonNullable<ProviderSyncJob['options']> = {};

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    const [rawKey, inlineValue] = arg.startsWith('--') ? arg.slice(2).split('=') : [index === 0 ? 'maxRoutePatterns' : '', arg];
    if (!rawKey) {
      continue;
    }

    const value = inlineValue ?? args[index + 1];
    if (inlineValue === undefined && arg.startsWith('--')) {
      index++;
    }

    if (rawKey === 'maxPages') {
      options.maxPages = Number(value);
    }
    if (rawKey === 'maxItems') {
      options.maxItems = Number(value);
    }
    if (rawKey === 'maxRoutePatterns') {
      options.maxRoutePatterns = Number(value);
    }
    if (rawKey === 'includeTrips') {
      options.includeTrips = value === 'true';
    }
  }

  return Object.keys(options).length ? options : undefined;
}

async function main() {
  const config = loadWorkerConfig();
  assertWorkerConfig(config);

  const providerCode = process.argv[2];
  if (!providerCode) {
    throw new Error('Usage: npm run enqueue -- PROVIDER_CODE [maxRoutePatterns] [--maxItems N] [--maxPages N] [--includeTrips true]');
  }

  const jobData: ProviderSyncJob = {
    providerCode,
    runType: 'FULL',
    options: parseOptions(process.argv.slice(3)),
  };
  const queue = createProviderSyncQueue(config);
  const job = await queue.add(`provider-sync:${providerCode}`, jobData, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  });

  console.log(JSON.stringify({ queued: true, queue: queue.name, jobId: job.id, providerCode }));
  await queue.close();
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
