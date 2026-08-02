import { Injectable, NotImplementedException } from '@nestjs/common';
import { ApiResult } from '../../core/dto/api-response.dto';

@Injectable()
export class MetroService {
  async getMockData(): Promise<ApiResult<any>> {
    throw new NotImplementedException('Metro APIs are under development.');
  }
}
