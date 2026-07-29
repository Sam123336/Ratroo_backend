export interface CanonicalRoute {
  id?: string;
  agencyId: string;
  shortName?: string;
  longName: string;
  originStopId?: string;
  destinationStopId?: string;
  routeType?: string;
  provider: string;
  externalId?: string;
}