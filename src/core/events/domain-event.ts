import type { UniqueId } from "../domain/entity";

export interface DomainEventEnvelope<TPayload = unknown> {
  readonly eventId: UniqueId;
  readonly eventType: string;
  readonly schemaVersion: number;
  readonly occurredAt: string;
  readonly correlationId: UniqueId;
  readonly causationId: UniqueId | null;
  readonly aggregateId: UniqueId;
  readonly aggregateType: string;
  readonly payload: TPayload;
}

export interface DomainEvent<TPayload = unknown> extends DomainEventEnvelope<TPayload> {}
