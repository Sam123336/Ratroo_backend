export interface TripProps {
  id?: string;
  routeId: string;
  direction: 'UP' | 'DOWN';
  serviceId?: string;
  vehicleName?: string;
  vehicleRegistration?: string;
  provider: string;
  externalId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Trip {
  readonly id?: string;
  readonly routeId: string;
  readonly direction: 'UP' | 'DOWN';
  readonly serviceId?: string;
  readonly vehicleName?: string;
  readonly vehicleRegistration?: string;
  readonly provider: string;
  readonly externalId?: string;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;

  constructor(props: TripProps) {
    this.id = props.id;
    this.routeId = props.routeId;
    this.direction = props.direction;
    this.serviceId = props.serviceId;
    this.vehicleName = props.vehicleName;
    this.vehicleRegistration = props.vehicleRegistration;
    this.provider = props.provider;
    this.externalId = props.externalId;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
