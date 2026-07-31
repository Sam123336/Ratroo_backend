import { Controller, Get } from '@nestjs/common';
import { ProviderIngestionQueryService } from '../../application/ProviderIngestionQueryService';

@Controller('v1/canonical-conflicts')
export class CanonicalConflictsController {
  constructor(private readonly queries: ProviderIngestionQueryService) {}

  @Get()
  async listCanonicalConflicts() {
    const conflicts = await this.queries.listCanonicalConflicts();
    return { data: conflicts, count: conflicts.length };
  }
}

