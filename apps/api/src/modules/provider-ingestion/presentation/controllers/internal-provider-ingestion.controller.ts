import { Controller, Param, Post } from '@nestjs/common';
import { DatasetPromotionService } from '../../application/DatasetPromotionService';

@Controller('internal')
export class InternalProviderIngestionController {
  constructor(private readonly promotion: DatasetPromotionService) {}

  @Post('providers/:code/sync')
  syncProvider(@Param('code') code: string) {
    return this.promotion.enqueueProviderSync(code);
  }

  @Post('dataset-versions/:id/promote')
  promoteDatasetVersion(@Param('id') id: string) {
    return this.promotion.promoteDatasetVersion(id);
  }

  @Post('dataset-versions/:id/reject')
  rejectDatasetVersion(@Param('id') id: string) {
    return this.promotion.rejectDatasetVersion(id);
  }

  @Post('node-mappings/:id/resolve')
  resolveNodeMapping(@Param('id') id: string) {
    return {
      id,
      status: 'NOT_IMPLEMENTED',
      note: 'Manual node resolution workflow will be connected after canonical node tables are promoted.',
    };
  }
}

