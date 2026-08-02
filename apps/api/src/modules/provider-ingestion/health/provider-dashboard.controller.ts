import { Controller, Get, Param } from '@nestjs/common';
import { ProviderHealthService, ProviderDashboardStats } from './provider-health.service';

@Controller('api/v1/provider-ingestion/dashboard')
export class ProviderDashboardController {
  constructor(private readonly healthService: ProviderHealthService) {}

  @Get('stats')
  async getAllStats(): Promise<ProviderDashboardStats[]> {
    return this.healthService.getAllDashboardStats();
  }

  @Get('stats/:providerCode')
  async getProviderStats(@Param('providerCode') providerCode: string): Promise<ProviderDashboardStats> {
    return this.healthService.getDashboardStats(providerCode);
  }
}
