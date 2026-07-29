export interface AgencyProps {
  id?: string;
  name: string;
  code: string;
  state?: string;
  city?: string;
  country?: string;
  provider: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Agency {
  readonly id?: string;
  readonly name: string;
  readonly code: string;
  readonly state?: string;
  readonly city?: string;
  readonly country: string;
  readonly provider: string;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;

  constructor(props: AgencyProps) {
    this.id = props.id;
    this.name = props.name;
    this.code = props.code;
    this.state = props.state;
    this.city = props.city;
    this.country = props.country || 'India';
    this.provider = props.provider;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
