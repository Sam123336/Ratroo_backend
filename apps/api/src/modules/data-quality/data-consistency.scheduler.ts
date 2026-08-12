import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataConsistencyService } from './data-consistency.service';

/**
 * Runs after the nightly provider sync, not before it.
 *
 * Ingestion is what creates the duplicates and the mixed time formats, so a
 * pass that ran first would tidy yesterday's data and leave today's. The
 * default 03:30 gives the 02:00 sync an hour and a half.
 */
@Injectable()
export class DataConsistencyScheduler {
  private readonly logger = new Logger(DataConsistencyScheduler.name);

  constructor(private readonly consistency: DataConsistencyService) {}

  @Cron(process.env.DATA_CONSISTENCY_CRON || '30 3 * * *', {
    name: 'data-consistency',
  })
  async nightly(): Promise<void> {
    // Opt out without redeploying, and — importantly — a way to watch what it
    // *would* do for a few nights before letting it delete anything.
    if (process.env.DATA_CONSISTENCY_ENABLED === 'false') {
      this.logger.log('data consistency pass disabled by env');
      return;
    }

    await this.consistency.run(process.env.DATA_CONSISTENCY_DRY_RUN === 'true');
  }
}
