import { Controller, Get, Param, Query } from '@nestjs/common';
import { BengaluruJourneyPlannerService } from '../../application/BengaluruJourneyPlannerService';

@Controller('v1/regions/:regionSlug/journeys')
export class BengaluruJourneyController {
  constructor(private readonly journeyPlanner: BengaluruJourneyPlannerService) {}

  @Get()
  async plan(
    @Param('regionSlug') regionSlug: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return {
      data: await this.journeyPlanner.plan(regionSlug, {
        from,
        to,
        limit: this.positiveNumber(limit, 5),
      }),
    };
  }

  private positiveNumber(value: string | undefined, fallback: number) {
    const parsed = Number(value);

    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}
