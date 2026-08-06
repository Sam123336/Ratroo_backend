import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CanonicalTransitProjectionService } from './CanonicalTransitProjectionService';
import { BmrclStaticImportService } from './BmrclStaticImportService';
import { BmtcGtfsImportService } from './BmtcGtfsImportService';
import { GovernmentBusStaticImportService } from './GovernmentBusStaticImportService';
import { KolkataMetroStaticImportService } from './KolkataMetroStaticImportService';
import { WBBusImportService } from './WBBusImportService';

/** Every provider the scheduler knows how to import, in run order. */
export const SYNCABLE_PROVIDER_CODES = [
  'WBBUS',
  'WBTC',
  'NBSTC',
  'SBSTC',
  'KOLKATA_TRAM',
  'KOLKATA_METRO',
  'WB_FERRY',
  'EASTERN_RAILWAY_SUBURBAN',
  'BMRCL',
  'BMTC',
] as const;

/** Aliases the same importer answers to. */
const PROVIDER_ALIASES: Record<string, string> = {
  WTBC: 'WBTC',
  BMRCL_METRO: 'BMRCL',
  BMTC_OFFICIAL: 'BMTC',
};

@Injectable()
export class ProviderSyncSchedulerService {
  private readonly logger = new Logger(ProviderSyncSchedulerService.name);
  private running = false;

  constructor(
    private readonly bmrclImport: BmrclStaticImportService,
    private readonly bmtcImport: BmtcGtfsImportService,
    private readonly wbbusImport: WBBusImportService,
    private readonly governmentBusImport: GovernmentBusStaticImportService,
    private readonly kolkataMetroImport: KolkataMetroStaticImportService,
    private readonly projection: CanonicalTransitProjectionService,
  ) {}

  /**
   * Nightly full sync. Runs in-process, so it only fires on a long-lived host
   * (docker / Railway / Fly). On Vercel there is no persistent process — use the
   * Vercel Cron entry that POSTs /internal/cron/provider-sync instead.
   *
   * Gate with PROVIDER_SYNC_CRON_ENABLED=true; override the time with
   * PROVIDER_SYNC_CRON (standard 5-field cron).
   */
  @Cron(process.env.PROVIDER_SYNC_CRON || '0 2 * * *', {
    name: 'provider-nightly-sync',
    timeZone: process.env.PROVIDER_SYNC_TIMEZONE || 'Asia/Kolkata',
  })
  async nightlySync() {
    if (!this.enabled()) {
      return;
    }

    await this.runOnce('nightly-cron');
  }

  /** Runs every configured provider once. Re-entrant calls are dropped, not queued. */
  async runOnce(trigger: string) {
    if (this.running) {
      this.logger.warn(`Skipping provider sync ${trigger}; a previous run is still active.`);
      return { skipped: true, reason: 'already-running' };
    }

    this.running = true;
    const startedAt = Date.now();
    const results: Array<{ providerCode: string; status: 'ok' | 'failed' | 'unsupported' }> = [];

    try {
      for (const providerCode of this.providerCodes()) {
        results.push(await this.syncProvider(providerCode, trigger));
      }
      // Importing without publishing leaves the app reading empty tables, which
      // is exactly how /v1/routes stayed at 0 rows while bus_routes had 1,239.
      try {
        await this.projection.project();
      } catch (error) {
        const message = error instanceof Error ? error.stack || error.message : String(error);
        this.logger.error('Canonical transit projection failed after sync.', message);
      }
    } finally {
      this.running = false;
    }

    const failed = results.filter(result => result.status === 'failed').length;
    this.logger.log(
      `Provider sync (${trigger}) finished in ${Math.round((Date.now() - startedAt) / 1000)}s — ` +
        `${results.length - failed}/${results.length} succeeded.`,
    );

    return { trigger, durationMs: Date.now() - startedAt, results };
  }

  private async syncProvider(providerCode: string, trigger: string) {
    const code = this.canonicalCode(providerCode);
    this.logger.log(`Starting ${code} provider sync from ${trigger}.`);

    try {
      const importer = this.importerFor(code);

      if (!importer) {
        this.logger.warn(`Provider ${code} has no importer yet; skipped.`);
        return { providerCode: code, status: 'unsupported' as const };
      }

      await importer();
      this.logger.log(`Finished ${code} provider sync.`);
      return { providerCode: code, status: 'ok' as const };
    } catch (error) {
      const message = error instanceof Error ? error.stack || error.message : String(error);
      this.logger.error(`Provider ${code} sync failed.`, message);
      // One bad provider must not abort the rest of the night's run.
      return { providerCode: code, status: 'failed' as const };
    }
  }

  /** Single source of truth for code -> importer. Was an if-chain duplicated here and in the internal controller. */
  private importerFor(code: string): (() => Promise<unknown>) | undefined {
    switch (code) {
      case 'WBBUS':
        return () =>
          this.wbbusImport.importAllBuses({
            maxPages: this.positiveInt('WBBUS_SYNC_MAX_PAGES', 200),
            maxItems: this.positiveInt('WBBUS_SYNC_MAX_ITEMS', 1280),
          });
      case 'BMRCL':
        return () => this.bmrclImport.importStaticNetwork();
      case 'KOLKATA_METRO':
        return () => this.kolkataMetroImport.importStaticNetwork();
      case 'BMTC':
        return () => this.bmtcImport.importGtfsFeed();
      case 'WBTC':
      case 'NBSTC':
      case 'SBSTC':
      case 'KOLKATA_TRAM':
      case 'WB_FERRY':
      case 'EASTERN_RAILWAY_SUBURBAN':
        return () => this.governmentBusImport.importRoutes(code);
      default:
        return undefined;
    }
  }

  private canonicalCode(providerCode: string) {
    const upper = providerCode.trim().toUpperCase();
    return PROVIDER_ALIASES[upper] || upper;
  }

  private enabled() {
    return this.envFlag('PROVIDER_SYNC_CRON_ENABLED');
  }

  private envFlag(name: string) {
    return ['true', '1', 'yes', 'on'].includes(String(process.env[name] || '').toLowerCase());
  }

  /** Defaults to every syncable provider; narrow it with PROVIDER_SYNC_PROVIDERS. */
  providerCodes(): string[] {
    const configured = String(process.env.PROVIDER_SYNC_PROVIDERS || '')
      .split(',')
      .map(code => code.trim().toUpperCase())
      .filter(Boolean);

    return configured.length ? configured : [...SYNCABLE_PROVIDER_CODES];
  }

  private positiveInt(name: string, fallback: number) {
    const parsed = Number(process.env[name]);

    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}
