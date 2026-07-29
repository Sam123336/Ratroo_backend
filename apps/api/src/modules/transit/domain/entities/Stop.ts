import { Coordinates } from '../value-objects/Coordinates';

export interface StopProps {
  id?: string;
  name: string;
  normalizedName: string;
  coordinates?: Coordinates;
  city?: string;
  district?: string;
  state?: string;
  provider: string;
  externalId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Stop {
  readonly id?: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly coordinates?: Coordinates;
  readonly city?: string;
  readonly district?: string;
  readonly state?: string;
  readonly provider: string;
  readonly externalId?: string;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;

  constructor(props: StopProps) {
    this.id = props.id;
    this.name = props.name;
    this.normalizedName = props.normalizedName || props.name.trim().toLowerCase().replace(/\s+/g, ' ');
    this.coordinates = props.coordinates;
    this.city = props.city;
    this.district = props.district;
    this.state = props.state;
    this.provider = props.provider;
    this.externalId = props.externalId;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
