import { Injectable, NotFoundException } from '@nestjs/common';
import { RouteRepository } from '../repositories/route.repository';
import { RouteMapper } from '../mappers/route.mapper';
import { RouteResponseDto } from '../dto/route-response.dto';
import { ApiResult } from '../../core/dto/api-response.dto';
import { ProvenanceService } from '../../core/services/provenance.service';

@Injectable()
export class RouteService {
  constructor(
    private readonly routeRepository: RouteRepository,
    private readonly routeMapper: RouteMapper,
    private readonly provenanceService: ProvenanceService
  ) {}

  async getRouteById(id: string): Promise<ApiResult<RouteResponseDto>> {
    const route = await this.routeRepository.findRoute(id);
    if (!route) {
      throw new NotFoundException(`Bus route with ID or query '${id}' not found in database.`);
    }

    const stops = await this.routeRepository.getRouteStops(route.id);
    const trips = await this.routeRepository.getRouteTrips(route.id);

    const dto = this.routeMapper.mapToDto(route, stops, trips);
    const provenance = this.provenanceService.buildProvenanceForRoute(route.providerCode, route.externalId);

    return new ApiResult(dto, {
      confidenceScore: provenance.confidence,
      providerCount: 1,
      providers: [route.providerCode],
      providerProvenance: [provenance],
      deepLinks: this.provenanceService.generateDeepLinks(route.providerCode, route.externalId),
    });
  }

  async findRoutesPassingPlace(placeId: string): Promise<Array<{ id: string; longName: string; providerCode: string }>> {
    return this.routeRepository.findRoutesPassingPlace(placeId);
  }
}
