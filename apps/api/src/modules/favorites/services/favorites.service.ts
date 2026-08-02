import { Injectable, NotImplementedException } from '@nestjs/common';
import { ApiResult } from '../../core/dto/api-response.dto';

@Injectable()
export class FavoritesService {
  async getMockData(): Promise<ApiResult<any>> {
    throw new NotImplementedException('Favorites APIs are under development.');
  }
}
