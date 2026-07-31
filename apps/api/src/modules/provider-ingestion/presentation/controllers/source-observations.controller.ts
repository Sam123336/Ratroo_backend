import { Controller, Get, Param } from '@nestjs/common';
import { ProviderIngestionQueryService } from '../../application/ProviderIngestionQueryService';

@Controller('v1/source-observations')
export class SourceObservationsController {
  constructor(private readonly queries: ProviderIngestionQueryService) {}

  @Get(':id')
  async getSourceObservation(@Param('id') id: string) {
    return { data: await this.queries.getSourceObservation(id) };
  }
}

