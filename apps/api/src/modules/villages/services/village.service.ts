import { Injectable, NotFoundException } from '@nestjs/common';
import { VillageRepository } from '../repositories/village.repository';
import { NearbyService } from '../../nearby/services/nearby.service';
import { VillageResponseDto } from '../dto/village-response.dto';
import { ApiResult } from '../../core/dto/api-response.dto';

@Injectable()
export class VillageService {
  constructor(
    private readonly villageRepository: VillageRepository,
    private readonly nearbyService: NearbyService
  ) {}

  async getVillageCoverageById(id: string): Promise<ApiResult<VillageResponseDto>> {
    const villagePlace = await this.villageRepository.findPlaceByIdOrName(id);

    if (!villagePlace) {
      throw new NotFoundException(`Village or place '${id}' not found in canonical graph.`);
    }

    const vLat = villagePlace.latitude ? parseFloat(villagePlace.latitude) : 0;
    const vLon = villagePlace.longitude ? parseFloat(villagePlace.longitude) : 0;
    const district = villagePlace.districtId;
    const block = villagePlace.blockId;

    let candidateStops: any[] = [];
    if (vLat !== 0 && vLon !== 0) {
      candidateStops = await this.villageRepository.findCandidatePlacesNear(vLat, vLon);
    } else {
      candidateStops = await this.villageRepository.findCandidatePlacesDefault();
    }

    // Exclude the village node itself if other candidates exist
    const otherStops = candidateStops.filter((s) => s.id !== villagePlace.id);
    const stopsToSearch = otherStops.length > 0 ? otherStops : candidateStops;

    const nearestResApi = this.nearbyService.findNearestStop(
      villagePlace.canonicalName,
      vLat,
      vLon,
      stopsToSearch.map((s) => ({
        externalId: s.id, // This is now placeId
        providerCode: 'CANONICAL',
        nodeType: s.type || 'BUS_STOP',
        name: s.canonicalName,
        normalizedName: s.normalizedName,
        aliases: [],
        latitude: parseFloat(s.latitude || '0'),
        longitude: parseFloat(s.longitude || '0'),
        geography: { countryCode: 'IN', stateCode: 'WB' },
        confidence: parseFloat(s.confidence || '0.90'),
      }))
    );

    const nearestRes = nearestResApi.data;

    const availableRoutesCount = await this.villageRepository.countAvailableRoutes(nearestRes.nearestStop.externalId);
    const availableBuses = await this.villageRepository.getAvailableRoutes(nearestRes.nearestStop.externalId);

    const dto: VillageResponseDto = {
      villageId: villagePlace.id,
      villageName: villagePlace.canonicalName,
      gramPanchayat: villagePlace.gpId || null,
      block: block || null,
      district: district || null,
      state: 'West Bengal',
      nearestStop: {
        id: nearestRes.nearestStop.externalId,
        name: nearestRes.nearestStop.name,
        providerCode: nearestRes.nearestStop.providerCode as string,
      },
      distanceKm: nearestRes.distanceKm,
      walkingTimeMinutes: nearestRes.walkingTimeMinutes,
      availableRoutesCount,
      availableBuses,
    };

    return new ApiResult(dto, {
      canonicalPlaceId: villagePlace.id,
      confidenceScore: parseFloat(villagePlace.confidence || '0.90'),
      providerCount: 1,
      providers: ['CENSUS', 'OSM'],
    });
  }

  async getNearestStopForLocation(id: string) {
    const result = await this.getVillageCoverageById(id);
    const village = result.data;
    
    return new ApiResult({
      locationId: id,
      locationName: village.villageName,
      nearestStop: village.nearestStop,
      distanceKm: village.distanceKm,
      walkingTimeMinutes: village.walkingTimeMinutes,
    }, result.metadata);
  }
}
