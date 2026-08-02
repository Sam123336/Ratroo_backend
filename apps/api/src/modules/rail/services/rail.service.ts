import { Injectable, NotImplementedException } from '@nestjs/common';
import { ApiResult } from '../../core/dto/api-response.dto';

@Injectable()
export class RailwayService {
  async getMockData(): Promise<ApiResult<any>> {
    throw new NotImplementedException('Railway APIs are under development.');
  }
}
