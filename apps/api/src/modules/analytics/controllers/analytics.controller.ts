import { Controller, Get, NotImplementedException } from '@nestjs/common';
import { AnalyticsService } from '../services/analytics.service';
import { ApiResult } from '../../core/dto/api-response.dto';

@Controller('v1/analytics')
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  @Get()
  async getBaseEndpoint(): Promise<ApiResult<any>> {
    return this.service.getMockData();
  }
}
