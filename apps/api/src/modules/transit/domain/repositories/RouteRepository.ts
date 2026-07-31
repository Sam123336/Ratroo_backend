import { Route } from '../entities/Route';
import { TransitQueryScope } from './StopRepository';

export interface RouteRepository {
  findById(id: string): Promise<Route | null>;
  findByExternalId(externalId: string): Promise<Route | null>;
  findAll(
    page: number,
    limit: number,
    search?: string,
    scope?: TransitQueryScope,
  ): Promise<{ items: Route[]; total: number }>;
  save(route: Route): Promise<Route>;
}

export const ROUTE_REPOSITORY_TOKEN = Symbol('RouteRepository');
