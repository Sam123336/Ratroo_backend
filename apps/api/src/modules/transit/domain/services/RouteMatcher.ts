/**
 * Pure domain service for matching routes by origin/destination.
 * Framework-independent — no NestJS imports.
 */
export interface RouteMatchCriteria {
  originStopName: string;
  destinationStopName: string;
  provider?: string;
}

export class RouteMatcher {
  static generateRouteKey(origin: string, destination: string): string {
    const o = origin.trim().toLowerCase().replace(/\s+/g, ' ');
    const d = destination.trim().toLowerCase().replace(/\s+/g, ' ');
    return `${o}->${d}`;
  }

  static generateExternalId(origin: string, destination: string, prefix: string): string {
    const o = origin.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '_');
    const d = destination.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '_');
    return `${prefix.toUpperCase()}_ROUTE_${o}->${d}`.toUpperCase();
  }
}
