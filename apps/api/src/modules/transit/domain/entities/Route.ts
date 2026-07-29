export interface RouteProps {
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

export class Route {
  readonly id?: string;
  readonly agencyId: string;
  readonly shortName?: string;
  readonly longName: string;
  readonly originStopId?: string;
  readonly destinationStopId?: string;
  readonly routeType: string;
  readonly provider: string;
  readonly externalId?: string;

  constructor(props: RouteProps) {
    this.id = props.id;
    this.agencyId = props.agencyId;
    this.shortName = props.shortName;
    this.longName = props.longName;
    this.originStopId = props.originStopId;
    this.destinationStopId = props.destinationStopId;
    this.routeType = props.routeType || 'BUS';
    this.provider = props.provider;
    this.externalId = props.externalId;
  }
}
