export abstract class DomainEvent {
  public readonly eventId: string;
  public readonly timestamp: Date;

  constructor(
    public readonly aggregateId: string,
    public readonly eventType: string,
    public readonly payload: Record<string, unknown>,
  ) {
    this.eventId = `${eventType}_${aggregateId}_${Date.now()}`;
    this.timestamp = new Date();
  }
}
