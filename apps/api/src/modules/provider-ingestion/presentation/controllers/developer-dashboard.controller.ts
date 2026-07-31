import { Controller, Get } from '@nestjs/common';
import { ProviderIngestionQueryService } from '../../application/ProviderIngestionQueryService';

@Controller('v1/developer-dashboard')
export class DeveloperDashboardController {
  constructor(private readonly queries: ProviderIngestionQueryService) {}

  @Get()
  async getDashboard() {
    return {
      data: await this.queries.getDeveloperDashboard(),
    };
  }
}
