export interface CanonicalStopTime {
  id?: string;
  tripId: string;
  stopId: string;
  stopSequence: number;
  arrivalTime?: string;
  departureTime?: string;
  createdAt?: Date;
}