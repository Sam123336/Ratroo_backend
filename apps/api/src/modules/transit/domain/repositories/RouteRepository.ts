import { Route } from '../entities/Route';

export interface RouteRepository {
  findById(id: string): Promise<Route | null>;
  findByExternalId(externalId: string): Promise<Route | null>;
  findAll(page: number, limit: number, search?: string): Promise<{ items: Route[]; total: number }>;
  save(route: Route): Promise<Route>;
}

export const ROUTE_REPOSITORY_TOKEN = Symbol('RouteRepository');
