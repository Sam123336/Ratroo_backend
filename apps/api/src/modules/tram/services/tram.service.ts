import { Injectable, NotImplementedException } from '@nestjs/common';
import { ApiResult } from '../../core/dto/api-response.dto';

@Injectable()
export class TramService {
  async getMockData(): Promise<ApiResult<any>> {
    throw new NotImplementedException('Tram APIs are under development.');
  }
}
