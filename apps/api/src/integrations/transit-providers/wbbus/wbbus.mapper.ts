import { Injectable } from '@nestjs/common';
import { NormalizedTransitData } from '../provider.interface';
import { WBBusScrapedBus } from './wbbus.types';

@Injectable()
export class WBBusMapper {
  mapToNormalizedTransitData(scrapedBuses: WBBusScrapedBus[]): NormalizedTransitData {
    const stopsMap = new Map<string, { name: string; normalizedName: string }>();
    const routesMap = new Map<string, { externalId: string; longName: string; originStopName: string; destinationStopName: string }>();
    const trips: NormalizedTransitData['trips'] = [];

    for (const bus of scrapedBuses) {
      if (!bus.schedule || bus.schedule.length < 2) continue;

      const validStops = bus.schedule.filter(s => s.stoppageName && s.stoppageName.trim());
      if (validStops.length < 2) continue;

      // Collect stops
      for (const stop of validStops) {
        const name = stop.stoppageName.trim().replace(/\s+/g, ' ');
        const key = name.toLowerCase();
        if (!stopsMap.has(key)) {
          stopsMap.set(key, {
            name,
            normalizedName: key,
          });
        }
      }

      const origin = validStops[0].stoppageName.trim();
      const destination = validStops[validStops.length - 1].stoppageName.trim();

      const routeKey = `${origin.toLowerCase()}->${destination.toLowerCase()}`;
      if (!routesMap.has(routeKey)) {
        routesMap.set(routeKey, {
          externalId: `WBBUS_ROUTE_${routeKey.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`,
          longName: `${origin} - ${destination}`,
          originStopName: origin,
          destinationStopName: destination,
        });
      }

      const route = routesMap.get(routeKey)!;
      const busId = bus.sourceUrl.split('/').pop() || 'bus';

      // UP Direction Trip
      trips.push({
        externalId: `WBBUS_TRIP_${busId}_UP`,
        routeExternalId: route.externalId,
        direction: 'UP',
        vehicleName: bus.name || undefined,
        vehicleRegistration: bus.registration || undefined,
        stopTimes: validStops.map((stop, idx) => ({
          stopName: stop.stoppageName.trim(),
          stopSequence: idx + 1,
          arrivalTime: (stop.upTime && stop.upTime !== '_ _ : _ _') ? stop.upTime : undefined,
          departureTime: (stop.upTime && stop.upTime !== '_ _ : _ _') ? stop.upTime : undefined,
        })),
      });

      // DOWN Direction Trip
      const reversedStops = [...validStops].reverse();
      const reverseRouteKey = `${destination.toLowerCase()}->${origin.toLowerCase()}`;
      if (!routesMap.has(reverseRouteKey)) {
        routesMap.set(reverseRouteKey, {
          externalId: `WBBUS_ROUTE_${reverseRouteKey.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`,
          longName: `${destination} - ${origin}`,
          originStopName: destination,
          destinationStopName: origin,
        });
      }
      const reverseRoute = routesMap.get(reverseRouteKey)!;

      trips.push({
        externalId: `WBBUS_TRIP_${busId}_DOWN`,
        routeExternalId: reverseRoute.externalId,
        direction: 'DOWN',
        vehicleName: bus.name || undefined,
        vehicleRegistration: bus.registration || undefined,
        stopTimes: reversedStops.map((stop, idx) => ({
          stopName: stop.stoppageName.trim(),
          stopSequence: idx + 1,
          arrivalTime: (stop.downTime && stop.downTime !== '_ _ : _ _') ? stop.downTime : undefined,
          departureTime: (stop.downTime && stop.downTime !== '_ _ : _ _') ? stop.downTime : undefined,
        })),
      });
    }

    return {
      agency: {
        name: 'Private Buses of West Bengal',
        code: 'WBBUS',
        state: 'West Bengal',
        city: 'Kolkata',
      },
      stops: Array.from(stopsMap.values()),
      routes: Array.from(routesMap.values()),
      trips,
    };
  }
}
