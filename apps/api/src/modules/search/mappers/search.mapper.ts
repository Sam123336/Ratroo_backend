import { Injectable } from '@nestjs/common';
import { PlaceSearchResult, RouteSearchResult } from '../repositories/search.repository';
import { SearchResponseDto } from '../dto/search-response.dto';

@Injectable()
export class SearchMapper {
  mapPlaceToDto(place: PlaceSearchResult): SearchResponseDto {
    return {
      id: place.id,
      category: 'BUS_STOP',
      title: place.name,
      subtitle: 'Canonical Place',
      latitude: place.latitude,
      longitude: place.longitude,
      providerCode: 'CANONICAL',
      aliases: place.aliases || [],
      relevanceScore: 0.95,
    };
  }

  mapRouteToDto(route: RouteSearchResult): SearchResponseDto {
    return {
      id: route.id,
      category: 'BUS_NAME',
      title: route.longName,
      subtitle: `${route.providerCode} Route`,
      providerCode: route.providerCode,
      aliases: [],
      relevanceScore: 0.90,
    };
  }
}
