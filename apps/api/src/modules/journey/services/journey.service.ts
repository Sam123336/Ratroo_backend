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

    const originCandidates = await this.journeyRepository.findPlacesByName(from);
    if (!originCandidates.length) {
      throw new NotFoundException(`Origin location '${from}' was not found in the canonical graph database.`);
    }

    const destCandidates = await this.journeyRepository.findPlacesByName(to);
    if (!destCandidates.length) {
      throw new NotFoundException(`Destination location '${to}' was not found in the canonical graph database.`);
    }

    const originPlace = originCandidates[0];
    const destPlace = destCandidates[0];

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
    // The typed name and the place's normalised form are both worth matching:
    // operators title the same stand differently, and the canonical row keeps
    // only one of those titles.
    const namesFor = (place: any, typed: string) =>
      [place.normalizedName, typed].filter(
        (value: string | null) => !!value && value !== place.canonicalName,
      );

    let journeys = await this.planner.planAll(
      {
        lat: originLat,
        lng: originLng,
        placeId: originPlace.id,
        name: originPlace.canonicalName || from,
        altNames: namesFor(originPlace, from),
      },
      {
        lat: destLat,
        lng: destLng,
        placeId: destPlace.id,
        name: destPlace.canonicalName || to,
        altNames: namesFor(destPlace, to),
      },
    );

    // A name can mean more than one place, and one operator's record of it may
    // hold none of the services another operator's does. "Asansol" and
    // "Asansol Bus Terminus" are the same bus stand under two imports; picking
    // the wrong one reported no route where six exist. So a failed search
    // falls through to the next reading of the name rather than becoming the
    // answer.
    for (const candidate of destCandidates.slice(1)) {
      if (journeys.length) break;
      journeys = await this.planner.planAll(
        {
          lat: originLat,
          lng: originLng,
          placeId: originPlace.id,
          name: originPlace.canonicalName || from,
          altNames: namesFor(originPlace, from),
        },
        {
          lat: coordinate(candidate.latitude),
          lng: coordinate(candidate.longitude),
          placeId: candidate.id,
          name: candidate.canonicalName || to,
          altNames: namesFor(candidate, to),
        },
      );
    }

    const journey = journeys[0];

    if (!journey) {
      throw new NotFoundException(
        `No route found between '${originPlace.canonicalName}' and '${destPlace.canonicalName}', ` +
          `even allowing up to two transfers.`,
      );
    }

    const toLegs = (plan: typeof journey): JourneyLegDto[] =>
      plan.legs.map((leg, index) => ({
        legNumber: index + 1,
        mode: leg.mode,
        fromName: leg.fromStop?.name ?? originPlace.canonicalName,
        toName: leg.toStop.name,
        distanceKm: `${leg.distanceKm.toFixed(1)} km`,
        durationMinutes: leg.durationMinutes,
        providerCode: leg.providerCode,
        serviceName: leg.routeName,
        routeId: leg.routeId,
        fareINR: leg.fareINR ?? null,
        departureTime: leg.departureTime ?? null,
        arrivalTime: leg.arrivalTime ?? null,
        options: leg.options,
        instructions:
          leg.options
            // Both ways, in one sentence: the planner recommends, it does not
            // decide for the rider. A 5 km "walk to the stop" with no
            // alternative is not a usable instruction.
            ? `${leg.options.map(option => `${option.label} (${option.durationMinutes} min)`).join(' or ')}` +
              ` to ${leg.toStop.name}`
            : leg.mode === 'WALK'
              ? `Walk ${leg.distanceKm.toFixed(1)} km to ${leg.toStop.name}`
              : leg.departureTime
                ? `Board ${leg.routeName} at ${leg.fromStop?.name} at ${leg.departureTime}, ` +
                  `ride to ${leg.toStop.name}`
                : `Board ${leg.routeName} at ${leg.fromStop?.name} and ride to ${leg.toStop.name}`,
      }));

    const legs = toLegs(journey);

    // Was parseFloat() on a column the repository used to return as `any`.
    // Typing the repository revealed it: the value is already a number, and
    // parseFloat(number) is a type error the untyped query had been hiding.
    const confidence = originPlace.confidence ?? 0.9;

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
      totalFare: journey.totalFareINR,
      fareIncomplete: journey.fareIncomplete,
      fareSources: journey.fareSources,
      confidenceScore: confidence,
      confidenceBadges: [...journey.providers, 'Canonical Graph ✓'],
      // Everything else the search found, so a rider can trade a change
      // against twenty minutes instead of being handed one answer.
      alternatives: journeys.slice(1).map(plan => ({
        legs: toLegs(plan),
        totalDistanceKm: `${plan.totalDistanceKm.toFixed(1)} km`,
        totalDurationMinutes: plan.totalDurationMinutes,
        transfersCount: plan.transfersCount,
        totalFare: plan.totalFareINR,
        fareIncomplete: plan.fareIncomplete,
        fareSources: plan.fareSources,
      })),
    };

    return new ApiResult(dto, {
      confidenceScore: confidence,
      providerCount: journey.providers.length,
      providers: journey.providers,
      dataSources: ['Ratroo Graph Planner'],
    });
  }
}
