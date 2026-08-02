import { Controller, Get, NotImplementedException } from '@nestjs/common';
import { PlacesService } from '../services/places.service';
import { ApiResult } from '../../core/dto/api-response.dto';

@Controller('v1/places')
export class PlacesController {
  constructor(private readonly service: PlacesService) {}

  @Get()
  async getBaseEndpoint(): Promise<ApiResult<any>> {
    return this.service.getMockData();
  }
}
