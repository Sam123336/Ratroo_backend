import { Controller, Get, Param, Query } from '@nestjs/common';
import { ProviderHealthService } from './provider-health.service';
import { CoverageDashboardService } from './coverage-dashboard.service';
import { DataQualityGateService } from '../enrichment/data-quality-gate.service';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';

@Controller('internal/dashboard')
export class InternalOpsDashboardController {
  constructor(
    private readonly providerHealthService: ProviderHealthService,
    private readonly coverageDashboardService: CoverageDashboardService,
    private readonly dataQualityGateService: DataQualityGateService,
    private readonly sequelize: Sequelize
  ) {}

  @Get('providers')
  async getProvidersTelemetry() {
    const telemetry = await this.providerHealthService.getRealProviderQualityMetrics();
    return {
      timestamp: new Date().toISOString(),
      providersCount: telemetry.length,
      telemetry,
    };
  }

  @Get('quality')
  async getProviderQualityDashboard() {
    const qualityMetrics = await this.providerHealthService.getRealProviderQualityMetrics();
    return {
      timestamp: new Date().toISOString(),
      providersCount: qualityMetrics.length,
      qualityMetrics,
    };
  }

  @Get('quality-gates')
  async getQualityGates() {
    return this.dataQualityGateService.runAllGates();
  }

  @Get('provider/:providerCode')
  async getProviderDetail(@Param('providerCode') providerCode: string) {
    return this.providerHealthService.getDetailedProviderTelemetry(providerCode);
  }

  @Get('routes')
  async getRoutesCatalog(@Query('providerCode') providerCode?: string) {
    const replacements: any = {};
    let whereClause = '';

    if (providerCode) {
      whereClause = 'WHERE "providerCode" = :providerCode';
      replacements.providerCode = providerCode.toUpperCase();
    }

    const routes: any[] = await this.sequelize.query(
      `SELECT "id", "providerCode", "metadata"->>'shortName' as "shortName", "longName", "metadata" as "provenanceMetadata", "datasetVersionId", "createdAt"
       FROM "bus_routes" ${whereClause}
       ORDER BY "createdAt" DESC
       LIMIT 100;`,
      { replacements, type: QueryTypes.SELECT }
    );

    return {
      count: routes.length,
      routes,
    };
  }

  @Get('stops')
  async getStopsCatalog(@Query('providerCode') providerCode?: string) {
    const replacements: any = {};
    let whereClause = '';

    if (providerCode) {
      whereClause = 'WHERE "providerCode" = :providerCode';
      replacements.providerCode = providerCode.toUpperCase();
    }

    const stops: any[] = await this.sequelize.query(
      `SELECT "id", "providerCode", "name", "normalizedName", "metadata", "datasetVersionId", "createdAt"
       FROM "bus_stops" ${whereClause}
       ORDER BY "createdAt" DESC
       LIMIT 100;`,
      { replacements, type: QueryTypes.SELECT }
    );

    return {
      count: stops.length,
      stops,
    };
  }

  @Get('coverage')
  async getCoverageReport() {
    return this.coverageDashboardService.getWestBengalCoverageReport();
  }

  @Get('sync-history')
  async getSyncHistory() {
    const runs: any[] = await this.sequelize.query(
      `SELECT "id", "providerCode", "status", "createdAt"
       FROM "provider_runs"
       ORDER BY "createdAt" DESC
       LIMIT 50;`,
      { type: QueryTypes.SELECT }
    );

    return {
      count: runs.length,
      runs,
    };
  }
}
