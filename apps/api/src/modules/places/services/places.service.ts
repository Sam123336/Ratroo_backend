import { Injectable, NotImplementedException } from '@nestjs/common';
import { ApiResult } from '../../core/dto/api-response.dto';

@Injectable()
export class PlacesService {
  async getMockData(): Promise<ApiResult<any>> {
    throw new NotImplementedException('Places APIs are under development.');
  }
}
