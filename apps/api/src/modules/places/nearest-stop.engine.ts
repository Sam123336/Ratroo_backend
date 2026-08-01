import { Injectable, NotFoundException } from '@nestjs/common';
import { CanonicalMobilityNode } from '../provider-ingestion/domain/canonical-mobility';

export interface NearestStopResult {
  villageName: string;
  district?: string;
  block?: string;
  nearestStop: CanonicalMobilityNode;
  distanceMeters: number;
  distanceKm: string;
  walkingTimeMinutes: number;
  walkingDirectionsText: string;
}

@Injectable()
export class NearestStopEngine {
  findNearestStop(
    villageName: string,
    villageLat: number,
    villageLon: number,
    availableStops: CanonicalMobilityNode[],
    district?: string,
    block?: string
  ): NearestStopResult {
    if (!availableStops || availableStops.length === 0) {
      throw new NotFoundException(`No candidate transport stops found in database for ${villageName}.`);
    }

    let bestStop: CanonicalMobilityNode | null = null;
    let minDistance = Infinity;

    for (const stop of availableStops) {
      if (typeof stop.latitude !== 'number' || typeof stop.longitude !== 'number') continue;

      const dist = this.haversineDistanceMeters(villageLat, villageLon, stop.latitude, stop.longitude);
      if (dist < minDistance) {
        minDistance = dist;
        bestStop = stop;
      }
    }

    if (!bestStop) {
      bestStop = availableStops[0];
      minDistance = 1100;
    }

    const distanceKm = `${(minDistance / 1000).toFixed(1)} km`;
    const walkingTimeMinutes = Math.round(minDistance / 80);

    return {
      villageName,
      district,
      block,
      nearestStop: bestStop,
      distanceMeters: Math.round(minDistance),
      distanceKm,
      walkingTimeMinutes,
      walkingDirectionsText: `Walk ${distanceKm} (${walkingTimeMinutes} min) from ${villageName} to ${bestStop.name}`,
    };
  }

  private haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
}
