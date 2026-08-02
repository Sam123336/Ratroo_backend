import { Controller, Get, NotImplementedException } from '@nestjs/common';
import { FavoritesService } from '../services/favorites.service';
import { ApiResult } from '../../core/dto/api-response.dto';

@Controller('v1/favorites')
export class FavoritesController {
  constructor(private readonly service: FavoritesService) {}

  @Get()
  async getBaseEndpoint(): Promise<ApiResult<any>> {
    return this.service.getMockData();
  }
}
