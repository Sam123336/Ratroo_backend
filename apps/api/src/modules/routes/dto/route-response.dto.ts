export class RouteStopDto {
  stopId: string;
  name: string;
  sequence: number;
}

export class RouteTripDto {
  vehicleName?: string;
  departureTime?: string;
}

export class RouteResponseDto {
  id: string;
  externalId: string;
  providerCode: string;
  shortName: string | null;
  longName: string;
  operationalStatus: string;
  datasetVersionId: string;
  operator: string | null;
  fareINR: number | null;
  trips: RouteTripDto[];
  intermediateStops: RouteStopDto[];
}
