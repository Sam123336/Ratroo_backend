import { Body, Controller, Get, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { CreateServiceRequestDto } from '../dto/service-request.dto';
import { ServiceRequestsService } from '../services/service-requests.service';

@Controller('v1/service-requests')
export class ServiceRequestsController {
  constructor(private readonly requests: ServiceRequestsService) {}

  /**
   * Public: the whole point is someone with no account, in a state we do not
   * cover, leaving a number. Requiring sign-up first would collect nothing.
   */
  @Post()
  async create(@Body() dto: CreateServiceRequestDto) {
    return this.requests.record(dto);
  }

  /** Internal — the expansion queue, so it is behind the ingestion key. */
  @Get('demand')
  async demand(@Headers('x-internal-api-key') apiKey?: string) {
    if (!process.env.INTERNAL_INGESTION_API_KEY || apiKey !== process.env.INTERNAL_INGESTION_API_KEY) {
      throw new UnauthorizedException('Invalid or missing internal API key.');
    }
    return this.requests.demand();
  }
}
