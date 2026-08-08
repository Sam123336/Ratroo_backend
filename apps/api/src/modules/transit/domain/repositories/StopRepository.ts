import { Stop } from '../entities/Stop';
import { Coordinates } from '../value-objects/Coordinates';

export interface NearbyStopResult {
  stop: Stop;
  distanceMeters: number;
  /** Mode of services calling here, e.g. BUS_STOP. */
  category?: string;
  /** Services calling here, so a list row can name the buses you can catch. */
  routes?: Array<{ id: string; name: string | null }>;
}

export interface TransitQueryScope {
  country?: string;
  state?: string;
  district?: string;
  city?: string;
  providerCodes?: string[];
}

export interface StopRepository {
  findById(id: string): Promise<Stop | null>;
  findByNormalizedName(normalizedName: string): Promise<Stop | null>;
  findNearby(
    coordinates: Coordinates,
    radiusMeters: number,
    scope?: TransitQueryScope,
  ): Promise<NearbyStopResult[]>;
  findAll(
    page: number,
    limit: number,
    search?: string,
    scope?: TransitQueryScope,
  ): Promise<{ items: Stop[]; total: number }>;
  save(stop: Stop): Promise<Stop>;
}

export const STOP_REPOSITORY_TOKEN = Symbol('StopRepository');
