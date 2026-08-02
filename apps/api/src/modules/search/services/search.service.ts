import { Injectable } from '@nestjs/common';
import { SearchRepository } from '../repositories/search.repository';
import { SearchMapper } from '../mappers/search.mapper';
import { SearchResponseDto, SearchCategory } from '../dto/search-response.dto';
import { ApiResult } from '../../core/dto/api-response.dto';

@Injectable()
export class SearchService {
  constructor(
    private readonly searchRepository: SearchRepository,
    private readonly searchMapper: SearchMapper
  ) {}

  async search(query: string, categoryFilter?: SearchCategory): Promise<ApiResult<SearchResponseDto[]>> {
    const q = (query || '').toLowerCase().trim();
    if (!q) return new ApiResult([]);

    const [placesRes, routesRes] = await Promise.all([
      this.searchRepository.findPlaces(q),
      this.searchRepository.findRoutes(q)
    ]);

    const results: SearchResponseDto[] = [];

    placesRes.forEach((place) => {
      results.push(this.searchMapper.mapPlaceToDto(place));
    });

    routesRes.forEach((route) => {
      results.push(this.searchMapper.mapRouteToDto(route));
    });

    return new ApiResult(results, {
      confidenceScore: 0.95,
      providerCount: 1,
      providers: ['CANONICAL'],
      dataSources: ['Places Database', 'Routes Database'],
    });
  }
}
