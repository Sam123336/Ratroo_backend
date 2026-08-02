import { Controller, Get, NotImplementedException } from '@nestjs/common';
import { TramService } from '../services/tram.service';
import { ApiResult } from '../../core/dto/api-response.dto';

@Controller('v1/tram')
export class TramController {
  constructor(private readonly service: TramService) {}

  @Get()
  async getBaseEndpoint(): Promise<ApiResult<any>> {
    return this.service.getMockData();
  }
}
