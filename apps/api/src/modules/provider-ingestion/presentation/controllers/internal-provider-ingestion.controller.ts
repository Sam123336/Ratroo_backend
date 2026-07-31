import { Controller, Headers, Param, Post, UnauthorizedException } from '@nestjs/common';
import { BmrclStaticImportService } from '../../application/BmrclStaticImportService';
import { DatasetPromotionService } from '../../application/DatasetPromotionService';
import { WBBusImportService } from '../../application/WBBusImportService';

@Controller('internal')
export class InternalProviderIngestionController {
  constructor(
    private readonly promotion: DatasetPromotionService,
    private readonly bmrclImport: BmrclStaticImportService,
    private readonly wbbusImport: WBBusImportService,
  ) {}

  @Post('providers/:code/sync')
  syncProvider(@Param('code') code: string, @Headers('x-internal-api-key') internalApiKey?: string) {
    this.assertInternalAccess(internalApiKey);

    if (code.toUpperCase() === 'BMRCL') {
      return this.bmrclImport.importStaticNetwork();
    }

    if (code.toUpperCase() === 'WBBUS') {
      return this.wbbusImport.importAllBuses();
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
}
