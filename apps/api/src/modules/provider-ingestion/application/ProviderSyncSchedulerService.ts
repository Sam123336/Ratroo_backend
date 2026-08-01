import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BmrclStaticImportService } from './BmrclStaticImportService';
import { BmtcGtfsImportService } from './BmtcGtfsImportService';
import { WBBusImportService } from './WBBusImportService';

@Injectable()
export class ProviderSyncSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProviderSyncSchedulerService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly bmrclImport: BmrclStaticImportService,
    private readonly bmtcImport: BmtcGtfsImportService,
    private readonly wbbusImport: WBBusImportService,
  ) {}

  onModuleInit() {
    if (!this.enabled()) {
      return;
    }

    const intervalMinutes = this.positiveInt('PROVIDER_SYNC_INTERVAL_MINUTES', 360);
    const intervalMs = intervalMinutes * 60 * 1000;
    const providers = this.providerCodes();

    this.logger.log(`Provider sync scheduler enabled for ${providers.join(', ')} every ${intervalMinutes} minutes.`);

    if (this.envFlag('PROVIDER_SYNC_RUN_ON_START')) {
      void this.runOnce('startup');
    }

    this.timer = setInterval(() => {
      void this.runOnce('interval');
    }, intervalMs);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async runOnce(trigger: string) {
    if (this.running) {
      this.logger.warn(`Skipping provider sync ${trigger}; a previous scheduler run is still active.`);
      return;
    }

    this.running = true;

    try {
      for (const providerCode of this.providerCodes()) {
        await this.syncProvider(providerCode, trigger);
      }
    } finally {
      this.running = false;
    }
  }

  private async syncProvider(providerCode: string, trigger: string) {
    const code = providerCode.toUpperCase();
    this.logger.log(`Starting ${code} provider sync from ${trigger}.`);

    try {
      if (code === 'WBBUS') {
        await this.wbbusImport.importAllBuses({
          maxPages: this.positiveInt('WBBUS_SYNC_MAX_PAGES', 200),
          maxItems: this.positiveInt('WBBUS_SYNC_MAX_ITEMS', 1280),
        });
        this.logger.log(`Finished ${code} provider sync.`);
        return;
      }

      if (code === 'BMRCL' || code === 'BMRCL_METRO') {
        await this.bmrclImport.importStaticNetwork();
        this.logger.log(`Finished ${code} provider sync.`);
        return;
      }

      if (code === 'BMTC' || code === 'BMTC_OFFICIAL') {
        await this.bmtcImport.importGtfsFeed();
        this.logger.log(`Finished ${code} provider sync.`);
        return;
      }

      this.logger.warn(`Provider ${code} has no real importer yet; scheduler skipped it.`);
    } catch (error) {
      const message = error instanceof Error ? error.stack || error.message : String(error);
      this.logger.error(`Provider ${code} sync failed.`, message);
    }
  }

  private enabled() {
    return this.envFlag('PROVIDER_SYNC_CRON_ENABLED');
  }

  private envFlag(name: string) {
    return ['true', '1', 'yes', 'on'].includes(String(process.env[name] || '').toLowerCase());
  }

  private providerCodes() {
    return String(process.env.PROVIDER_SYNC_PROVIDERS || 'WBBUS')
      .split(',')
      .map(code => code.trim().toUpperCase())
      .filter(Boolean);
  }

  private positiveInt(name: string, fallback: number) {
    const parsed = Number(process.env[name]);

    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}
