export interface StopTimeProps {
  id?: string;
  tripId: string;
  stopId: string;
  stopSequence: number;
  arrivalTime?: string;
  departureTime?: string;
  createdAt?: Date;
}

export class StopTime {
  readonly id?: string;
  readonly tripId: string;
  readonly stopId: string;
  readonly stopSequence: number;
  readonly arrivalTime?: string;
  readonly departureTime?: string;
  readonly createdAt?: Date;

  constructor(props: StopTimeProps) {
    this.id = props.id;
    this.tripId = props.tripId;
    this.stopId = props.stopId;
    this.stopSequence = props.stopSequence;
    this.arrivalTime = props.arrivalTime;
    this.departureTime = props.departureTime;
    this.createdAt = props.createdAt;
  }
}
