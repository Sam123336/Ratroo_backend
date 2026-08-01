import { Controller, Headers, Param, Post, Query, UnauthorizedException } from '@nestjs/common';
import { BmrclStaticImportService } from '../../application/BmrclStaticImportService';
import { BmtcGtfsImportService } from '../../application/BmtcGtfsImportService';
import { DatasetPromotionService } from '../../application/DatasetPromotionService';
import { GovernmentBusStaticImportService } from '../../application/GovernmentBusStaticImportService';
import { KolkataMetroStaticImportService } from '../../application/KolkataMetroStaticImportService';
import { WBBusImportService } from '../../application/WBBusImportService';
import { GenericProviderIngestionService } from '../../application/GenericProviderIngestionService';

// Target Provider Adapters
import { WBBusProvider } from '../../providers/wbbus.provider';
import { WBBustimeProvider } from '../../providers/wbbustime.provider';
import { BusSathiProvider } from '../../providers/bussathi.provider';
import { OpenStreetMapProvider } from '../../providers/openstreetmap.provider';
import { NominatimProvider } from '../../providers/nominatim.provider';
import { CensusIndiaProvider } from '../../providers/census-india.provider';
import { DataGovIndiaProvider } from '../../providers/data-gov-india.provider';

@Controller('internal')
export class InternalProviderIngestionController {
  constructor(
    private readonly promotion: DatasetPromotionService,
    private readonly bmrclImport: BmrclStaticImportService,
    private readonly bmtcImport: BmtcGtfsImportService,
    private readonly wbbusImport: WBBusImportService,
    private readonly governmentBusImport: GovernmentBusStaticImportService,
    private readonly kolkataMetroImport: KolkataMetroStaticImportService,
    private readonly genericIngestion: GenericProviderIngestionService,
    private readonly wbbusProvider: WBBusProvider,
    private readonly wbbustimeProvider: WBBustimeProvider,
    private readonly bussathiProvider: BusSathiProvider,
    private readonly osmProvider: OpenStreetMapProvider,
    private readonly nominatimProvider: NominatimProvider,
    private readonly censusProvider: CensusIndiaProvider,
    private readonly dataGovProvider: DataGovIndiaProvider,
  ) {}

  @Post('providers/:code/sync')
  async syncProvider(
    @Param('code') code: string,
    @Headers('x-internal-api-key') internalApiKey?: string,
    @Query('maxPages') maxPages?: string,
    @Query('maxItems') maxItems?: string,
    @Query('maxRoutePatterns') maxRoutePatterns?: string,
    @Query('async') asyncMode?: string,
  ) {
    this.assertInternalAccess(internalApiKey);
    const upperCode = code.toUpperCase();

    if (upperCode === 'WBBUSTIME') {
      return this.genericIngestion.runIngestionPipeline(this.wbbustimeProvider);
    }

    if (upperCode === 'BUSSATHI') {
      return this.genericIngestion.runIngestionPipeline(this.bussathiProvider);
    }

    if (['OPENSTREETMAP', 'OSM'].includes(upperCode)) {
      return this.genericIngestion.runIngestionPipeline(this.osmProvider);
    }

    if (['NOMINATIM'].includes(upperCode)) {
      return this.genericIngestion.runIngestionPipeline(this.nominatimProvider);
    }

    if (['CENSUS_INDIA', 'CENSUS'].includes(upperCode)) {
      return this.genericIngestion.runIngestionPipeline(this.censusProvider);
    }

    if (['DATA_GOV_INDIA', 'DATA_GOV', 'DATAGOV'].includes(upperCode)) {
      return this.genericIngestion.runIngestionPipeline(this.dataGovProvider);
    }

    if (upperCode === 'WBBUS') {
      return this.genericIngestion.runIngestionPipeline(this.wbbusProvider);
    }

    if (['BMRCL_METRO', 'BMRCL'].includes(upperCode)) {
      if (this.enabled(asyncMode)) {
        void this.bmrclImport.importStaticNetwork().catch(() => undefined);
        return { providerCode: 'BMRCL_METRO', status: 'QUEUED' };
      }
      return this.bmrclImport.importStaticNetwork();
    }

    if (['KOLKATA_METRO', 'KOLKATA-METRO'].includes(upperCode)) {
      if (this.enabled(asyncMode)) {
        void this.kolkataMetroImport.importStaticNetwork().catch(() => undefined);
        return { providerCode: 'KOLKATA_METRO', status: 'QUEUED' };
      }
      return this.kolkataMetroImport.importStaticNetwork();
    }

    if (['BMTC_OFFICIAL', 'BMTC'].includes(upperCode)) {
      if (this.enabled(asyncMode)) {
        void this.bmtcImport.importGtfsFeed({ maxRoutePatterns: this.positiveNumber(maxRoutePatterns) }).catch(() => undefined);
        return { providerCode: 'BMTC_OFFICIAL', status: 'QUEUED' };
      }
      return this.bmtcImport.importGtfsFeed({ maxRoutePatterns: this.positiveNumber(maxRoutePatterns) });
    }

    if (
      upperCode === 'WBTC' ||
      upperCode === 'WTBC' ||
      upperCode === 'NBSTC' ||
      upperCode === 'SBSTC' ||
      upperCode === 'KOLKATA_TRAM' ||
      upperCode === 'WB_FERRY' ||
      upperCode === 'EASTERN_RAILWAY_SUBURBAN'
    ) {
      const providerCode = (upperCode === 'WTBC' ? 'WBTC' : upperCode) as
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

  private assertInternalAccess(internalApiKey?: string) {
    const expected = process.env.INTERNAL_INGESTION_API_KEY;
    if (expected && internalApiKey !== expected) {
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
