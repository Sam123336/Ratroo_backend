import { DomainEvent } from './DomainEvent';

export class TripImportedEvent extends DomainEvent {
  constructor(agencyId: string, payload: Record<string, unknown>) {
    super(agencyId, 'TRIP_IMPORTED', payload);
  }
}
