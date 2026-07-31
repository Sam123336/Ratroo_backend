import { Controller, Get, Param } from '@nestjs/common';
import { ProviderIngestionQueryService } from '../../application/ProviderIngestionQueryService';

@Controller('v1/provider-runs')
export class ProviderRunsController {
  constructor(private readonly queries: ProviderIngestionQueryService) {}

  @Get()
  async listProviderRuns() {
    const runs = await this.queries.listProviderRuns();
    return { data: runs, count: runs.length };
  }

  @Get(':id')
  async getProviderRun(@Param('id') id: string) {
    return { data: await this.queries.getProviderRun(id) };
  }

  @Get(':id/report')
  async getProviderRunReport(@Param('id') id: string) {
    return { data: await this.queries.getProviderRunReport(id) };
  }
}

