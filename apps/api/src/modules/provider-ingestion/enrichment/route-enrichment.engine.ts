import { Injectable } from '@nestjs/common';
import { CanonicalRoutePattern, CanonicalTrip, CanonicalFare } from '../domain/canonical-mobility';

export interface EnrichedRouteResult {
  route: CanonicalRoutePattern;
  trips: CanonicalTrip[];
  fares: CanonicalFare[];
  mergedProviders: string[];
  enrichmentActions: string[];
}

@Injectable()
export class RouteEnrichmentEngine {
  enrichRoute(
    routes: CanonicalRoutePattern[],
    trips: CanonicalTrip[],
    fares: CanonicalFare[]
  ): EnrichedRouteResult[] {
    const routeMap = new Map<string, CanonicalRoutePattern>();
    const providerSetMap = new Map<string, Set<string>>();
    const actionsMap = new Map<string, string[]>();

    routes.forEach((route) => {
      const key = this.getRouteKey(route.shortName, route.longName);
      if (!routeMap.has(key)) {
        routeMap.set(key, { ...route, stops: [...route.stops] });
        providerSetMap.set(key, new Set([route.providerCode]));
        actionsMap.set(key, [`INITIALIZED_FROM_${route.providerCode}`]);
      } else {
        const existing = routeMap.get(key)!;
        const providers = providerSetMap.get(key)!;
        const actions = actionsMap.get(key)!;

        providers.add(route.providerCode);

        // Better stop sequence merging: if incoming route has more stops, adopt them
        if (route.stops.length > existing.stops.length) {
          existing.stops = [...route.stops];
          actions.push(`ADOPTED_LONGER_STOP_SEQUENCE_FROM_${route.providerCode}`);
        }

        actionsMap.set(key, actions);
      }
    });

    const results: EnrichedRouteResult[] = [];
    routeMap.forEach((route, key) => {
      const providers = Array.from(providerSetMap.get(key) || []);
      const actions = actionsMap.get(key) || [];

      results.push({
        route,
        trips: trips.filter((t) => t.routeExternalId === route.externalId),
        fares,
        mergedProviders: providers,
        enrichmentActions: actions,
      });
    });

    return results;
  }

  private getRouteKey(shortName?: string, longName?: string): string {
    const s = (shortName || '').toLowerCase().trim();
    const l = (longName || '').toLowerCase().trim();
    return `${s}_${l}`;
  }
}
