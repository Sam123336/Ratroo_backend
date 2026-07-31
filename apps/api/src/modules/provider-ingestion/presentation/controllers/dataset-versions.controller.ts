import { Controller, Get, Param } from '@nestjs/common';
import { ProviderIngestionQueryService } from '../../application/ProviderIngestionQueryService';

@Controller('v1/dataset-versions')
export class DatasetVersionsController {
  constructor(private readonly queries: ProviderIngestionQueryService) {}

  @Get()
  async listDatasetVersions() {
    const versions = await this.queries.listDatasetVersions();
    return { data: versions, count: versions.length };
  }

  @Get(':id')
  async getDatasetVersion(@Param('id') id: string) {
    return { data: await this.queries.getDatasetVersion(id) };
  }
}

