import { Injectable, NotImplementedException } from '@nestjs/common';
import { ApiResult } from '../../core/dto/api-response.dto';

@Injectable()
export class AnalyticsService {
  async getMockData(): Promise<ApiResult<any>> {
    throw new NotImplementedException('Analytics APIs are under development.');
  }
}
