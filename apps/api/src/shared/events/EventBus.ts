import { DomainEvent } from '../../modules/transit/domain/events/DomainEvent';

export type EventHandler = (event: DomainEvent) => void | Promise<void>;

export interface EventBus {
  emit(event: DomainEvent): void | Promise<void>;
  on(eventType: string, handler: EventHandler): void;
  off(eventType: string, handler: EventHandler): void;
}
