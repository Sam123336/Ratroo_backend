import { Stop } from '../entities/Stop';
import { Coordinates } from '../value-objects/Coordinates';

export interface NearbyStopResult {
  stop: Stop;
  distanceMeters: number;
}

export interface StopRepository {
  findById(id: string): Promise<Stop | null>;
  findByNormalizedName(normalizedName: string): Promise<Stop | null>;
  findNearby(coordinates: Coordinates, radiusMeters: number): Promise<NearbyStopResult[]>;
  findAll(page: number, limit: number, search?: string): Promise<{ items: Stop[]; total: number }>;
  save(stop: Stop): Promise<Stop>;
}

export const STOP_REPOSITORY_TOKEN = Symbol('StopRepository');
