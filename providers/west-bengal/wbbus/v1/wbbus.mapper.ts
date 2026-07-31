import {
  CanonicalAgency,
  CanonicalMobilityNode,
  CanonicalRoutePattern,
  CanonicalTrip,
} from '../../../../apps/api/src/modules/provider-ingestion/domain/canonical-mobility';
import { WBBusRawBus } from './wbbus.types';

export interface WBBusCanonicalOutput {
  agencies: CanonicalAgency[];
  nodes: CanonicalMobilityNode[];
  routePatterns: CanonicalRoutePattern[];
  trips: CanonicalTrip[];
  vehicles: Array<Record<string, unknown>>;
}

export class WBBusMapper {
  map(records: WBBusRawBus[]): WBBusCanonicalOutput {
    const agencyMap = new Map<string, CanonicalAgency>();
    const nodeMap = new Map<string, CanonicalMobilityNode>();
    const routePatterns: CanonicalRoutePattern[] = [];
    const trips: CanonicalTrip[] = [];
    const vehicles: Array<Record<string, unknown>> = [];

    for (const record of records) {
      const agencyName = record.agencyName || 'Private Buses of West Bengal';
      const agencyExternalId = this.externalId(agencyName);
      agencyMap.set(agencyExternalId, {
        externalId: agencyExternalId,
        providerCode: 'WBBUS',
        name: agencyName,
        geography: { countryCode: 'IN', stateCode: 'WB', city: 'Kolkata' },
      });

      const validStops = record.schedule.filter(stop => stop.stoppageName.trim());
      for (const stop of validStops) {
        const name = this.cleanName(stop.stoppageName);
        const externalId = this.externalId(name);
        nodeMap.set(externalId, {
          externalId,
          providerCode: 'WBBUS',
          nodeType: 'BUS_STOP',
          name,
          normalizedName: name.toLowerCase(),
          aliases: [],
          geography: { countryCode: 'IN', stateCode: 'WB', city: 'Kolkata' },
          confidence: 0.55,
        });
      }

      const routeExternalId = this.externalId(record.sourceUrl);
      routePatterns.push({
        externalId: `${routeExternalId}:UP`,
        providerCode: 'WBBUS',
        agencyExternalId,
        mode: 'BUS',
        shortName: record.name || undefined,
        longName: `${validStops[0]?.stoppageName || record.origin || 'Unknown'} - ${validStops[validStops.length - 1]?.stoppageName || record.destination || 'Unknown'}`,
        directionId: 'UP',
        operationalStatus: 'UNKNOWN',
        stops: validStops.map((stop, index) => ({
          nodeExternalId: this.externalId(stop.stoppageName),
          name: this.cleanName(stop.stoppageName),
          sequence: index + 1,
        })),
      });

      trips.push({
        externalId: `${routeExternalId}:UP:TRIP`,
        providerCode: 'WBBUS',
        routeExternalId: `${routeExternalId}:UP`,
        direction: 'UP',
        vehicleRegistration: this.normalizeRegistration(record.registration),
        vehicleName: record.name || undefined,
        operationalStatus: 'UNKNOWN',
        stopTimes: validStops.map((stop, index) => ({
          stopExternalId: this.externalId(stop.stoppageName),
          stopName: this.cleanName(stop.stoppageName),
          sequence: index + 1,
          arrivalTime: this.usableTime(stop.upTime),
          departureTime: this.usableTime(stop.upTime),
          timeIsEstimated: false,
        })),
      });

      if (record.registration || record.name) {
        vehicles.push({
          providerCode: 'WBBUS',
          externalId: this.externalId(record.registration || record.name || record.sourceUrl),
          registration: this.normalizeRegistration(record.registration),
          name: record.name,
          sourceUrl: record.sourceUrl,
        });
      }
    }

    return {
      agencies: Array.from(agencyMap.values()),
      nodes: Array.from(nodeMap.values()),
      routePatterns,
      trips,
      vehicles,
    };
  }

  private cleanName(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
  }

  private externalId(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  private normalizeRegistration(value: string | null): string | undefined {
    return value?.trim().toUpperCase().replace(/\s+/g, '') || undefined;
  }

  private usableTime(value?: string): string | undefined {
    if (!value || value.trim() === '_ _ : _ _') {
      return undefined;
    }

    return /^([01]?\d|2[0-3]):[0-5]\d$/.test(value.trim()) ? value.trim() : undefined;
  }
}

