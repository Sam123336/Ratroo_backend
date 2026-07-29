export interface NormalizedTransitData {
  agency: {
    name: string;
    code: string;
    state: string;
    city?: string;
  };
  stops: Array<{
    name: string;
    normalizedName: string;
    externalId?: string;
    city?: string;
    state?: string;
  }>;
  routes: Array<{
    externalId: string;
    longName: string;
    shortName?: string;
    originStopName: string;
    destinationStopName: string;
  }>;
  trips: Array<{
    externalId: string;
    routeExternalId: string;
    direction: 'UP' | 'DOWN';
    vehicleName?: string;
    vehicleRegistration?: string;
    stopTimes: Array<{
      stopName: string;
      stopSequence: number;
      arrivalTime?: string;
      departureTime?: string;
    }>;
  }>;
}

export interface TransitProvider {
  readonly providerCode: string;
  discover(): Promise<unknown[]>;
  fetch(items: unknown[]): Promise<unknown[]>;
  normalize(data: unknown[]): Promise<NormalizedTransitData>;
}
