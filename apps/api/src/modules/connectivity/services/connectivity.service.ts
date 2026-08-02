import { Injectable, NotImplementedException } from '@nestjs/common';
import { ApiResult } from '../../core/dto/api-response.dto';

@Injectable()
export class ConnectivityService {
  async getMockData(): Promise<ApiResult<any>> {
    throw new NotImplementedException('Connectivity APIs are under development.');
  }
}
