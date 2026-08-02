import { Controller, Get, NotImplementedException } from '@nestjs/common';
import { ConnectivityService } from '../services/connectivity.service';
import { ApiResult } from '../../core/dto/api-response.dto';

@Controller('v1/connectivity')
export class ConnectivityController {
  constructor(private readonly service: ConnectivityService) {}

  @Get()
  async getBaseEndpoint(): Promise<ApiResult<any>> {
    return this.service.getMockData();
  }
}
