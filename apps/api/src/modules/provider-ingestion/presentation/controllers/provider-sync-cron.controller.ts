import { All, Controller, Headers, Logger, UnauthorizedException } from '@nestjs/common';
import { CanonicalTransitProjectionService } from '../../application/CanonicalTransitProjectionService';
import { ProviderSyncQueueService } from '../../application/ProviderSyncQueueService';
import { ProviderSyncSchedulerService } from '../../application/ProviderSyncSchedulerService';

/**
 * HTTP trigger for the nightly sync, for hosts with no resident process
 * (Vercel Cron, GitHub Actions, an external scheduler).
 *
 * Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; everything else
 * can use the existing `x-internal-api-key`. Either is accepted.
 */
@Controller('internal/cron')
export class ProviderSyncCronController {
  private readonly logger = new Logger(ProviderSyncCronController.name);

  constructor(
    private readonly queue: ProviderSyncQueueService,
    private readonly scheduler: ProviderSyncSchedulerService,
    private readonly projection: CanonicalTransitProjectionService,
  ) {}

  /**
   * Republish the promoted provider network into the canonical transit tables
   * that /v1/routes, /v1/stops/nearby and /v1/journey read. Idempotent — safe to
   * re-run any time ingestion has added data.
   */
  @All('project-transit')
  async projectTransit(
    @Headers('authorization') authorization?: string,
    @Headers('x-internal-api-key') internalApiKey?: string,
  ) {
    this.assertAuthorized(authorization, internalApiKey);
    return this.projection.project();
  }

  // @All, not @Get + @Post: Nest keeps only the last stacked method decorator.
  // Vercel Cron invokes with GET; POST is for manual/curl triggering.
  @All('provider-sync')
  async triggerProviderSync(
    @Headers('authorization') authorization?: string,
    @Headers('x-internal-api-key') internalApiKey?: string,
  ) {
    this.assertAuthorized(authorization, internalApiKey);

    const providerCodes = this.scheduler.providerCodes();

    // Preferred path: hand off to the worker and return immediately. A Vercel
    // function is killed once it responds, so a full import can never run here.
    if (this.queue.available) {
      return this.queue.enqueueAll(providerCodes, 'cron');
    }

    this.logger.warn(
      'REDIS_URL is not set — running the sync inline. Safe on a long-lived host, ' +
        'but on serverless this will be killed at the function timeout.',
    );
    return this.scheduler.runOnce('http-cron');
  }

  private assertAuthorized(authorization?: string, internalApiKey?: string) {
    const cronSecret = process.env.CRON_SECRET;
    const apiKey = process.env.INTERNAL_INGESTION_API_KEY;

    if (cronSecret && authorization === `Bearer ${cronSecret}`) {
      return;
    }
    if (apiKey && internalApiKey === apiKey) {
      return;
    }

    throw new UnauthorizedException('Invalid cron credentials.');
  }
}
