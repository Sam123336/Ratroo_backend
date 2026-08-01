import { Controller, Headers, Param, Post, Query, UnauthorizedException } from '@nestjs/common';
import { BmrclStaticImportService } from '../../application/BmrclStaticImportService';
import { BmtcGtfsImportService } from '../../application/BmtcGtfsImportService';
import { DatasetPromotionService } from '../../application/DatasetPromotionService';
import { GovernmentBusStaticImportService } from '../../application/GovernmentBusStaticImportService';
import { KolkataMetroStaticImportService } from '../../application/KolkataMetroStaticImportService';
import { WBBusImportService } from '../../application/WBBusImportService';

@Controller('internal')
export class InternalProviderIngestionController {
  constructor(
    private readonly promotion: DatasetPromotionService,
    private readonly bmrclImport: BmrclStaticImportService,
    private readonly bmtcImport: BmtcGtfsImportService,
    private readonly wbbusImport: WBBusImportService,
    private readonly governmentBusImport: GovernmentBusStaticImportService,
    private readonly kolkataMetroImport: KolkataMetroStaticImportService,
  ) {}

  @Post('providers/:code/sync')
  syncProvider(
    @Param('code') code: string,
    @Headers('x-internal-api-key') internalApiKey?: string,
    @Query('maxPages') maxPages?: string,
    @Query('maxItems') maxItems?: string,
    @Query('maxRoutePatterns') maxRoutePatterns?: string,
    @Query('async') asyncMode?: string,
  ) {
    this.assertInternalAccess(internalApiKey);

    if (['BMRCL_METRO', 'BMRCL'].includes(code.toUpperCase())) {
      if (this.enabled(asyncMode)) {
        void this.bmrclImport.importStaticNetwork().catch(() => undefined);
        return { providerCode: 'BMRCL_METRO', status: 'QUEUED' };
      }
      return this.bmrclImport.importStaticNetwork();
    }

    if (['KOLKATA_METRO', 'KOLKATA-METRO'].includes(code.toUpperCase())) {
      if (this.enabled(asyncMode)) {
        void this.kolkataMetroImport.importStaticNetwork().catch(() => undefined);
        return { providerCode: 'KOLKATA_METRO', status: 'QUEUED' };
      }
      return this.kolkataMetroImport.importStaticNetwork();
    }

    if (['BMTC_OFFICIAL', 'BMTC'].includes(code.toUpperCase())) {
      if (this.enabled(asyncMode)) {
        void this.bmtcImport.importGtfsFeed({ maxRoutePatterns: this.positiveNumber(maxRoutePatterns) }).catch(() => undefined);
        return { providerCode: 'BMTC_OFFICIAL', status: 'QUEUED' };
      }
      return this.bmtcImport.importGtfsFeed({ maxRoutePatterns: this.positiveNumber(maxRoutePatterns) });
    }

    if (code.toUpperCase() === 'WBBUS') {
      if (this.enabled(asyncMode)) {
        void this.wbbusImport.importAllBuses({
          maxPages: this.positiveNumber(maxPages),
          maxItems: this.positiveNumber(maxItems),
        }).catch(() => undefined);
        return { providerCode: 'WBBUS', status: 'QUEUED' };
      }
      return this.wbbusImport.importAllBuses({
        maxPages: this.positiveNumber(maxPages),
        maxItems: this.positiveNumber(maxItems),
      });
    }

    if (
      code.toUpperCase() === 'WBTC' ||
      code.toUpperCase() === 'WTBC' ||
      code.toUpperCase() === 'NBSTC' ||
      code.toUpperCase() === 'SBSTC' ||
      code.toUpperCase() === 'KOLKATA_TRAM' ||
      code.toUpperCase() === 'WB_FERRY' ||
      code.toUpperCase() === 'EASTERN_RAILWAY_SUBURBAN'
    ) {
      const providerCode = (code.toUpperCase() === 'WTBC' ? 'WBTC' : code.toUpperCase()) as
        | 'WBTC'
        | 'NBSTC'
        | 'SBSTC'
        | 'KOLKATA_TRAM'
        | 'WB_FERRY'
        | 'EASTERN_RAILWAY_SUBURBAN';
      if (this.enabled(asyncMode)) {
        void this.governmentBusImport.importRoutes(providerCode).catch(() => undefined);
        return { providerCode, status: 'QUEUED' };
      }
      return this.governmentBusImport.importRoutes(providerCode);
    }

    return this.promotion.enqueueProviderSync(code);
  }

  @Post('dataset-versions/:id/promote')
  promoteDatasetVersion(@Param('id') id: string, @Headers('x-internal-api-key') internalApiKey?: string) {
    this.assertInternalAccess(internalApiKey);

    return this.promotion.promoteDatasetVersion(id);
  }

  @Post('dataset-versions/:id/reject')
  rejectDatasetVersion(@Param('id') id: string, @Headers('x-internal-api-key') internalApiKey?: string) {
    this.assertInternalAccess(internalApiKey);

    return this.promotion.rejectDatasetVersion(id);
  }

  @Post('node-mappings/:id/resolve')
  resolveNodeMapping(@Param('id') id: string, @Headers('x-internal-api-key') internalApiKey?: string) {
    this.assertInternalAccess(internalApiKey);

    return {
      id,
      status: 'NOT_IMPLEMENTED',
      note: 'Manual node resolution workflow will be connected after canonical node tables are promoted.',
    };
  }

  private assertInternalAccess(internalApiKey?: string) {
    const expected = process.env.INTERNAL_INGESTION_API_KEY;

    if (!expected || internalApiKey !== expected) {
      throw new UnauthorizedException('Internal ingestion API key is required.');
    }
  }

  private positiveNumber(value?: string): number | undefined {
    const parsed = Number(value);

    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  }

  private enabled(value?: string) {
    return ['true', '1', 'yes', 'on'].includes(String(value || '').toLowerCase());
  }
}
