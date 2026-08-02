import { Injectable } from '@nestjs/common';
import { CanonicalMobilityNode } from '../../provider-ingestion/domain/canonical-mobility';
import { ApiResult } from '../../core/dto/api-response.dto';

export interface NearestStopResult {
  villageName: string;
  nearestStop: CanonicalMobilityNode;
  distanceKm: string;
  walkingTimeMinutes: number;
}

@Injectable()
export class NearbyService {
  findNearestStop(
    villageName: string,
    vLat: number,
    vLon: number,
    candidateStops: CanonicalMobilityNode[]
  ): ApiResult<NearestStopResult> {
    if (!candidateStops || candidateStops.length === 0) {
      throw new Error(`No nearby stops could be resolved for village '${villageName}'.`);
    }

    let nearestStop = candidateStops[0];
    let minDistance = Number.MAX_VALUE;

    for (const stop of candidateStops) {
      const dist = this.haversineDistance(vLat, vLon, stop.latitude, stop.longitude);
      if (dist < minDistance) {
        minDistance = dist;
        nearestStop = stop;
      }
    }

    const walkingTimeMinutes = Math.round((minDistance / 5.0) * 60);

    const dto = {
      villageName,
      nearestStop,
      distanceKm: minDistance.toFixed(2),
      walkingTimeMinutes,
    };

    return new ApiResult(dto, {
      confidenceScore: nearestStop.confidence ?? 0.85,
      providerCount: 1,
      providers: [nearestStop.providerCode],
      dataSources: ['Geospatial Nearby Search'],
    });
  }

  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (x: number) => (x * Math.PI) / 180;
    const R = 6371; // Earth's radius in km

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
}
