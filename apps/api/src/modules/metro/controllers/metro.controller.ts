import { Controller, Get, NotImplementedException } from '@nestjs/common';
import { MetroService } from '../services/metro.service';
import { ApiResult } from '../../core/dto/api-response.dto';

@Controller('v1/metro')
export class MetroController {
  constructor(private readonly service: MetroService) {}

  @Get()
  async getBaseEndpoint(): Promise<ApiResult<any>> {
    return this.service.getMockData();
  }
}
