import { Injectable } from '@nestjs/common';
import { PlaceSearchResult, RouteSearchResult } from '../repositories/search.repository';
import { SearchCategory, SearchResponseDto } from '../dto/search-response.dto';
import { routeLabel } from '../../../shared/route-label';

/**
 * `places.type` is the only mode signal a place row carries, and it does not
 * distinguish a metro station from a railway one. Rows map to what can be known
 * from it and no further: guessing METRO_STATION off a bare STATION would put a
 * mode on screen that nothing in the record supports.
 */
const PLACE_CATEGORY: Record<string, SearchCategory> = {
  STOP: 'BUS_STOP',
  STATION: 'RAILWAY_STATION',
  VILLAGE: 'VILLAGE',
  GRAM_PANCHAYAT: 'AREA',
  BLOCK: 'AREA',
  SUBDIVISION: 'AREA',
  DISTRICT: 'AREA',
  STATE: 'AREA',
  OTHER: 'LANDMARK',
};

const readable = (value: string) =>
  value.toLowerCase().replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());

@Injectable()
export class SearchMapper {
  mapPlaceToDto(place: PlaceSearchResult): SearchResponseDto {
    const type = place.type || 'OTHER';
    return {
      id: place.id,
      category: PLACE_CATEGORY[type] || 'LANDMARK',
      title: place.name,
      subtitle: readable(type),
      latitude: place.latitude,
      longitude: place.longitude,
      providerCode: 'CANONICAL',
      aliases: place.aliases || [],
      relevanceScore: 0.95,
    };
  }

  mapRouteToDto(route: RouteSearchResult): SearchResponseDto {
    // The service number rides in metadata.shortName — DatasetPromotionService
    // puts it there because bus_routes has no column for it. Labelled through
    // the shared helper so search, nearby and the journey planner name the
    // same bus the same way.
    const shortName = String(route.metadata?.shortName || '').trim();
    return {
      id: route.id,
      category: shortName ? 'BUS_NUMBER' : 'BUS_NAME',
      title: routeLabel(shortName, route.longName),
      subtitle: `${route.providerCode} route`,
      providerCode: route.providerCode,
      aliases: [],
      relevanceScore: 0.90,
    };
  }
}
