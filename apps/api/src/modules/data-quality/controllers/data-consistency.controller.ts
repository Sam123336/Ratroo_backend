import { All, Controller, Headers, Query, UnauthorizedException } from '@nestjs/common';
import { DataConsistencyService } from '../services/data-consistency.service';

/**
 * HTTP trigger for hosts with no resident process, matching the provider-sync
 * cron entry: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`, anything
 * else can use `x-internal-api-key`.
 */
@Controller('internal/cron')
export class DataConsistencyController {
  constructor(private readonly consistency: DataConsistencyService) {}

  @All('data-consistency')
  async run(
    @Query('dryRun') dryRun?: string,
    @Headers('authorization') authorization?: string,
    @Headers('x-internal-api-key') internalApiKey?: string,
  ) {
    this.assertAuthorized(authorization, internalApiKey);
    // Defaults to a dry run over HTTP: a hand-triggered pass should have to ask
    // for deletions explicitly.
    return this.consistency.run(dryRun !== 'false');
  }

  private assertAuthorized(authorization?: string, internalApiKey?: string): void {
    const cronSecret = process.env.CRON_SECRET;
    const apiKey = process.env.INTERNAL_INGESTION_API_KEY;

    const viaCron = !!cronSecret && authorization === `Bearer ${cronSecret}`;
    const viaKey = !!apiKey && internalApiKey === apiKey;

    if (!viaCron && !viaKey) {
      throw new UnauthorizedException('Invalid or missing cron credentials.');
    }
  }
}
