import { Controller, Get, Post, Body, Param, Query, BadRequestException } from '@nestjs/common';
import { UniversalSearchService } from './universal-search.service';
import { VillageService } from './village.service';
import { RouteService } from './route.service';
import { VillageJourneyService } from '../planner/village-journey.service';
import { CoverageDashboardService } from '../provider-ingestion/health/coverage-dashboard.service';

export class PlanJourneyDto {
  from!: string;
  to!: string;
}

@Controller('v1')
export class PublicTransportGraphController {
  constructor(
    private readonly searchService: UniversalSearchService,
    private readonly villageService: VillageService,
    private readonly routeService: RouteService,
    private readonly villageJourneyService: VillageJourneyService
  ) {}

  @Get('location/search')
  async searchLocation(@Query('q') q: string) {
    if (!q || !q.trim()) throw new BadRequestException('Query parameter q is required.');
    return this.searchService.search(q);
  }

  @Get('location/:id/nearest')
  async getNearestTransportNodes(@Param('id') id: string) {
    return this.villageService.getNearestStopForLocation(id);
  }

  @Post('journey')
  async planJourney(@Body() dto: PlanJourneyDto) {
    if (!dto || !dto.from || !dto.to) {
      throw new BadRequestException('Body must contain non-empty from and to parameters.');
    }
    return this.villageJourneyService.planJourney(dto.from, dto.to);
  }

  @Get('routes/:id')
  async getRouteDetails(@Param('id') id: string) {
    return this.routeService.getRouteById(id);
  }

  @Get('villages/:id')
  async getVillageCoverage(@Param('id') id: string) {
    return this.villageService.getVillageCoverageById(id);
  }
}

@Controller('internal')
export class InternalProviderHealthDashboardController {
  constructor(private readonly coverageDashboardService: CoverageDashboardService) {}

  @Get('providers')
  async getInternalProvidersTelemetry() {
    return this.coverageDashboardService.getWestBengalCoverageReport();
  }
}
