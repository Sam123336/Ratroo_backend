import { Injectable, NotImplementedException } from '@nestjs/common';
import { ApiResult } from '../../core/dto/api-response.dto';

@Injectable()
export class FerryService {
  async getMockData(): Promise<ApiResult<any>> {
    throw new NotImplementedException('Ferry APIs are under development.');
  }
}
