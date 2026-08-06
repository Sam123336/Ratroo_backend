import { Inject, Injectable } from '@nestjs/common';
import {
  STOP_REPOSITORY_TOKEN,
  StopRepository,
  TransitQueryScope,
} from '../../domain/repositories/StopRepository';
import { Coordinates } from '../../domain/value-objects/Coordinates';

export interface FindNearbyStopsInput {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  scope?: TransitQueryScope;
}

export interface NearbyStopOutput {
  id?: string;
  name: string;
  normalizedName: string;
  latitude?: number;
  longitude?: number;
  provider: string;
  distanceMeters: number;
  /** Lets clients filter Nearby by bus/metro/ferry. */
  category?: string;
}

@Injectable()
export class FindNearbyStopsUseCase {
  constructor(
    @Inject(STOP_REPOSITORY_TOKEN)
    private readonly stopRepository: StopRepository,
  ) {}

  async execute(input: FindNearbyStopsInput): Promise<NearbyStopOutput[]> {
    const coordinates = new Coordinates(input.latitude, input.longitude);
    const radius = input.radiusMeters || 2000;

    const results = await this.stopRepository.findNearby(coordinates, radius, input.scope);

    return results.map(r => ({
      id: r.stop.id,
      name: r.stop.name,
      normalizedName: r.stop.normalizedName,
      latitude: r.stop.coordinates?.latitude,
      longitude: r.stop.coordinates?.longitude,
      provider: r.stop.provider,
      city: r.stop.city,
      district: r.stop.district,
      state: r.stop.state,
      distanceMeters: Math.round(r.distanceMeters),
      category: r.category,
    }));
  }
}
