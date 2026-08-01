import { Controller, Get, Param, Query } from '@nestjs/common';
import { BengaluruMobilityQueryService } from '../../application/BengaluruMobilityQueryService';

@Controller('v1')
export class BengaluruMobilityController {
  constructor(private readonly bengaluruMobility: BengaluruMobilityQueryService) {}

  @Get('regions/karnataka')
  getKarnatakaRegion() {
    return {
      data: this.bengaluruMobility.getKarnatakaRegion(),
    };
  }

  @Get('regions/:regionSlug/network-summary')
  async getNetworkSummary(@Param('regionSlug') regionSlug: string) {
    return {
      data: await this.bengaluruMobility.getNetworkSummary(regionSlug),
    };
  }

  @Get('regions/:regionSlug/coverage')
  async getCoverage(@Param('regionSlug') regionSlug: string) {
    return {
      data: await this.bengaluruMobility.getCoverage(regionSlug),
    };
  }

  @Get('regions/:regionSlug/search')
  async search(
    @Param('regionSlug') regionSlug: string,
    @Query('q') query = '',
    @Query('limit') limit?: string,
  ) {
    return {
      data: await this.bengaluruMobility.search(regionSlug, query, this.positiveNumber(limit, 20)),
    };
  }

  @Get('regions/:regionSlug/nearby')
  async nearby(
    @Param('regionSlug') regionSlug: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('limit') limit?: string,
  ) {
    return {
      data: await this.bengaluruMobility.nearby(regionSlug, Number(lat), Number(lng), this.positiveNumber(limit, 20)),
    };
  }

  private positiveNumber(value: string | undefined, fallback: number) {
    const parsed = Number(value);

    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}
