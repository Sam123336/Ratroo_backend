import { Controller, Get, NotImplementedException } from '@nestjs/common';
import { FerryService } from '../services/ferry.service';
import { ApiResult } from '../../core/dto/api-response.dto';

@Controller('v1/ferry')
export class FerryController {
  constructor(private readonly service: FerryService) {}

  @Get()
  async getBaseEndpoint(): Promise<ApiResult<any>> {
    return this.service.getMockData();
  }
}
