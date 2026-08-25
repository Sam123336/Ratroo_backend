export type TransportMode =
  | 'BUS'
  | 'METRO'
  | 'INTERCITY_BUS'
  | 'SUBURBAN_RAIL'
  | 'TRAM'
  | 'FERRY'
  | 'SHARED_AUTO'
  | 'AUTO'
  | 'SHUTTLE'
  | 'WALKING'
  | 'CYCLING'
  | 'ROAD';

export type SourceType =
  | 'GOVERNMENT'
  | 'GOVERNMENT_APP'
  | 'GOVERNMENT_GIS'
  | 'OPERATOR'
  | 'COMMUNITY'
  | 'OPEN_DATA'
  | 'THIRD_PARTY';

export type NodeType =
  | 'BUS_STOP'
  | 'BUS_STATION'
  | 'BUS_TERMINAL'
  | 'TTMC'
  | 'DEPOT'
  | 'PASS_COUNTER'
  | 'METRO_STATION'
  | 'METRO_ENTRANCE'
  | 'RAILWAY_STATION'
  | 'AIRPORT_TERMINAL'
  | 'TRAM_STOP'
  | 'FERRY_TERMINAL'
  | 'AUTO_STAND'
  | 'INTERCHANGE';

export type OperationalStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'SUSPENDED'
  | 'HISTORICAL'
  | 'PLANNED'
  | 'UNDER_CONSTRUCTION'
  | 'PARTIALLY_OPERATIONAL'
  | 'UNKNOWN';

export type VerificationStatus =
  | 'UNVERIFIED'
  | 'AUTO_VALIDATED'
  | 'COMMUNITY_VERIFIED'
  | 'OPERATOR_VERIFIED'
  | 'OFFICIAL';

export type ServiceClass =
  | 'REGULAR'
  | 'EXPRESS'
  | 'LIMITED_STOP'
  | 'AIRPORT'
  | 'METRO_FEEDER'
  | 'INTERCITY'
  | 'NIGHT'
  | 'PREMIUM'
  | 'UNKNOWN';

export interface CanonicalGeography {
  countryCode: 'IN';
  stateCode: 'WB' | 'KA' | string;
  stateName?: string;
  district?: string;
  metropolitanArea?: string;
  localAuthority?: string;
  zone?: string;
  ward?: string;
  subdivision?: string;
  municipality?: string;
  city?: string;
  block?: string;
  locality?: string;
}

export interface CanonicalProvider {
  code: string;
  name: string;
  sourceType: SourceType;
  website: string;
  version: string;
  transportModes: TransportMode[];
}

export interface CanonicalAgency {
  externalId?: string;
  providerCode: string;
  name: string;
  shortName?: string;
  phone?: string;
  website?: string;
  geography: CanonicalGeography;
}

export interface CanonicalMobilityNode {
  externalId?: string;
  providerCode: string;
  nodeType: NodeType;
  name: string;
  normalizedName: string;
  aliases: string[];
  latitude?: number;
  longitude?: number;
  geography: CanonicalGeography;
  confidence: number;
}

export interface CanonicalRoutePattern {
  externalId?: string;
  providerCode: string;
  agencyExternalId?: string;
  mode: TransportMode;
  shortName?: string;
  longName: string;
  directionId?: string;
  operationalStatus: OperationalStatus;
  serviceClass?: ServiceClass;
  stops: Array<{
    nodeExternalId?: string;
    name: string;
    sequence: number;
    pickupAllowed?: boolean;
    dropoffAllowed?: boolean;
  }>;
}

export interface CanonicalStopTime {
  stopExternalId?: string;
  stopName: string;
  sequence: number;
  arrivalTime?: string;
  departureTime?: string;
  timeIsEstimated?: boolean;
}

export interface CanonicalTrip {
  externalId?: string;
  providerCode: string;
  routeExternalId?: string;
  serviceName?: string;
  direction?: 'UP' | 'DOWN' | 'OUTBOUND' | 'INBOUND';
  vehicleRegistration?: string;
  vehicleName?: string;
  serviceDays?: number[];
  effectiveFrom?: string;
  effectiveUntil?: string;
  operationalStatus: OperationalStatus;
  serviceClass?: ServiceClass;
  stopTimes: CanonicalStopTime[];
}

export interface CanonicalFrequency {
  startTime?: string;
  endTime?: string;
  minimumHeadwayMinutes?: number;
  maximumHeadwayMinutes?: number;
}

export interface CanonicalFare {
  currency: 'INR';
  amount?: number;
  minimumAmount?: number;
  maximumAmount?: number;
  fromNodeExternalId?: string;
  toNodeExternalId?: string;
  fareType: 'FIXED' | 'DISTANCE_BASED' | 'ZONE_BASED' | 'MATRIX' | 'NEGOTIATED' | 'UNKNOWN';
}

export interface CanonicalSourceObservation {
  providerCode: string;
  providerVersion: string;
  sourceUrl: string;
  sourceRecordId?: string;
  fetchedAt: string;
  publishedAt?: string;
  effectiveFrom?: string;
  effectiveUntil?: string;
  contentHash: string;
  rawRecordId: string;
  confidence: number;
  verificationStatus: VerificationStatus;
  warnings: string[];
}

export interface CanonicalMobilityDataset {
  providers: CanonicalProvider[];
  agencies: CanonicalAgency[];
  nodes: CanonicalMobilityNode[];
  routePatterns: CanonicalRoutePattern[];
  trips: CanonicalTrip[];
  frequencies: CanonicalFrequency[];
  fares: CanonicalFare[];
  observations: CanonicalSourceObservation[];
}
