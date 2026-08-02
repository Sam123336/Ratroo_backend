import { Controller, Get, NotImplementedException } from '@nestjs/common';
import { RailwayService } from '../services/rail.service';
import { ApiResult } from '../../core/dto/api-response.dto';

@Controller('v1/rail')
export class RailwayController {
  constructor(private readonly service: RailwayService) {}

  @Get()
  async getBaseEndpoint(): Promise<ApiResult<any>> {
    return this.service.getMockData();
  }
}
