import { DomainEvent } from './DomainEvent';

export class StopCreatedEvent extends DomainEvent {
  constructor(stopId: string, payload: Record<string, unknown>) {
    super(stopId, 'STOP_CREATED', payload);
  }
}
