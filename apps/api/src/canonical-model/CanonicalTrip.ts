export interface CanonicalTrip {
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