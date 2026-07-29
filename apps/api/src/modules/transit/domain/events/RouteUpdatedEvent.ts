import { DomainEvent } from './DomainEvent';

export class RouteUpdatedEvent extends DomainEvent {
  constructor(routeId: string, payload: Record<string, unknown>) {
    super(routeId, 'ROUTE_UPDATED', payload);
  }
}
