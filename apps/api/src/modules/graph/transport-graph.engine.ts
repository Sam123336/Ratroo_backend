import { Injectable } from '@nestjs/common';
import { CanonicalMobilityNode, CanonicalRoutePattern } from '../provider-ingestion/domain/canonical-mobility';

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  label?: string;
}

export interface TransportGraphNodeConnection {
  transportNode: CanonicalMobilityNode;
  distanceMeters: number;
  walkTimeMinutes: number;
}

export interface TransportGraphTransfer {
  fromNode: CanonicalMobilityNode;
  toNode: CanonicalMobilityNode;
  transferType: 'WALKING' | 'CROSS_PLATFORM' | 'SHUTTLE';
  transferDurationMinutes: number;
}

export interface TransportGraphJourney {
  originLocation: LocationCoordinates;
  destinationLocation: LocationCoordinates;
  originNearestNodes: TransportGraphNodeConnection[];
  destinationNearestNodes: TransportGraphNodeConnection[];
  transfers: TransportGraphTransfer[];
  matchingRoutes: CanonicalRoutePattern[];
  estimatedTotalDurationMinutes: number;
  confidenceScore: number;
}

@Injectable()
export class TransportGraphEngine {
  buildJourneyGraph(
    origin: LocationCoordinates,
    destination: LocationCoordinates
  ): TransportGraphJourney {
    const originNode: CanonicalMobilityNode = {
      externalId: 'node_origin_nearest_1',
      providerCode: 'WBBUSTIME',
      nodeType: 'BUS_STOP',
      name: origin.label ? `${origin.label} Stop` : 'Origin Bus Stop',
      normalizedName: origin.label ? `${origin.label.toLowerCase()} stop` : 'origin bus stop',
      aliases: [],
      latitude: origin.latitude,
      longitude: origin.longitude,
      geography: { countryCode: 'IN', stateCode: 'WB' },
      confidence: 0.94,
    };

    const destNode: CanonicalMobilityNode = {
      externalId: 'node_dest_nearest_1',
      providerCode: 'WBBUSTIME',
      nodeType: 'BUS_STOP',
      name: destination.label ? `${destination.label} Stop` : 'Destination Bus Stop',
      normalizedName: destination.label ? `${destination.label.toLowerCase()} stop` : 'destination bus stop',
      aliases: [],
      latitude: destination.latitude,
      longitude: destination.longitude,
      geography: { countryCode: 'IN', stateCode: 'WB' },
      confidence: 0.94,
    };

    const originNearest: TransportGraphNodeConnection[] = [
      {
        transportNode: originNode,
        distanceMeters: 120,
        walkTimeMinutes: 2,
      },
    ];

    const destNearest: TransportGraphNodeConnection[] = [
      {
        transportNode: destNode,
        distanceMeters: 180,
        walkTimeMinutes: 3,
      },
    ];

    const transfers: TransportGraphTransfer[] = [
      {
        fromNode: originNode,
        toNode: destNode,
        transferType: 'WALKING',
        transferDurationMinutes: 5,
      },
    ];

    const matchingRoutes: CanonicalRoutePattern[] = [
      {
        externalId: 'graph_route_1',
        providerCode: 'WBBUS',
        mode: 'BUS',
        shortName: 'GRAPH-EXPRESS-1',
        longName: `${originNode.name} to ${destNode.name}`,
        operationalStatus: 'ACTIVE',
        stops: [
          { name: originNode.name, sequence: 1 },
          { name: 'Intermediate Hub', sequence: 2 },
          { name: destNode.name, sequence: 3 },
        ],
      },
    ];

    return {
      originLocation: origin,
      destinationLocation: destination,
      originNearestNodes: originNearest,
      destinationNearestNodes: destNearest,
      transfers,
      matchingRoutes,
      estimatedTotalDurationMinutes: 45,
      confidenceScore: 0.94,
    };
  }
}
