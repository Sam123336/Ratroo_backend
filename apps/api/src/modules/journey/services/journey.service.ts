import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiResult } from '../../core/dto/api-response.dto';
import { JourneyLegDto, JourneyResponseDto } from '../dto/journey.dto';
import { JourneyRepository } from '../repositories/journey.repository';
import { JourneyPlannerService } from './journey-planner.service';

@Injectable()
export class JourneyService {
  constructor(
    private readonly journeyRepository: JourneyRepository,
    private readonly planner: JourneyPlannerService,
  ) {}

  async planJourney(from: string, to: string): Promise<ApiResult<JourneyResponseDto>> {
    if (!from?.trim() || !to?.trim()) {
      throw new BadRequestException('Both from and to location parameters are required.');
    }

    const originPlace = await this.journeyRepository.findPlaceByName(from);
    if (!originPlace) {
      throw new NotFoundException(`Origin location '${from}' was not found in the canonical graph database.`);
    }

    const destPlace = await this.journeyRepository.findPlaceByName(to);
    if (!destPlace) {
      throw new NotFoundException(`Destination location '${to}' was not found in the canonical graph database.`);
    }

    // Number(null) is 0, so a place with no coordinates would otherwise look
    // like a valid point in the Gulf of Guinea and quietly return nonsense.
    const coordinate = (value: unknown) => {
      if (value === null || value === undefined || value === '') return NaN;
      return Number(value);
    };

    const originLat = coordinate(originPlace.latitude);
    const originLng = coordinate(originPlace.longitude);
    const destLat = coordinate(destPlace.latitude);
    const destLng = coordinate(destPlace.longitude);

    // Missing coordinates are not fatal — the planner falls back to matching
    // stops by name, which is how places like Kolkata (no lat/lng in `places`)
    // still resolve.
    const journey = await this.planner.plan(
      { lat: originLat, lng: originLng, placeId: originPlace.id, name: originPlace.canonicalName || from },
      { lat: destLat, lng: destLng, placeId: destPlace.id, name: destPlace.canonicalName || to },
    );

    if (!journey) {
      throw new NotFoundException(
        `No route found between '${originPlace.canonicalName}' and '${destPlace.canonicalName}', ` +
          `even allowing up to two transfers.`,
      );
    }

    const legs: JourneyLegDto[] = journey.legs.map((leg, index) => ({
      legNumber: index + 1,
      mode: leg.mode,
      fromName: leg.fromStop?.name ?? originPlace.canonicalName,
      toName: leg.toStop.name,
      distanceKm: `${leg.distanceKm.toFixed(1)} km`,
      durationMinutes: leg.durationMinutes,
      providerCode: leg.providerCode,
      serviceName: leg.routeName,
      routeId: leg.routeId,
      instructions:
        leg.mode === 'WALK'
          ? `Walk ${leg.distanceKm.toFixed(1)} km to ${leg.toStop.name}`
          : `Board ${leg.routeName} at ${leg.fromStop?.name} and ride to ${leg.toStop.name}`,
    }));

    const confidence = originPlace.confidence ? parseFloat(originPlace.confidence) : 0.9;

    const dto: JourneyResponseDto = {
      fromInput: from,
      toInput: to,
      originVillage: {
        name: originPlace.canonicalName,
        district: originPlace.districtId || undefined,
        state: 'West Bengal',
      },
      legs,
      totalDistanceKm: `${journey.totalDistanceKm.toFixed(1)} km`,
      totalDurationMinutes: journey.totalDurationMinutes,
      transfersCount: journey.transfersCount,
      confidenceScore: confidence,
      confidenceBadges: [...journey.providers, 'Canonical Graph ✓'],
    };

    return new ApiResult(dto, {
      confidenceScore: confidence,
      providerCount: journey.providers.length,
      providers: journey.providers,
      dataSources: ['Ratroo Graph Planner'],
    });
  }
}
