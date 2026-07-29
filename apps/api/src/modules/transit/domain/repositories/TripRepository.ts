import { Trip } from '../entities/Trip';

export interface TripRepository {
  findById(id: string): Promise<Trip | null>;
  findByExternalId(externalId: string): Promise<Trip | null>;
  findByRouteId(routeId: string): Promise<Trip[]>;
  save(trip: Trip): Promise<Trip>;
}

export const TRIP_REPOSITORY_TOKEN = Symbol('TripRepository');
