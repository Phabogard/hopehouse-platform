export type { Entity, UniqueId } from "./domain/entity";
export { BaseEntity } from "./domain/entity";
export type { DomainEvent, DomainEventEnvelope } from "./events/domain-event";
export type {
  OutboxMessage,
  OutboxStore,
  EventPublisher,
  OutboxRelayOptions,
} from "./outbox/outbox";
export { OutboxRelay, calculateExponentialBackoff } from "./outbox/outbox";
export { ConcurrencyConflictError, assertExpectedVersion } from "./concurrency/optimistic-concurrency";
export type { VersionedAggregate } from "./concurrency/optimistic-concurrency";
export type { IdempotencyRecord, IdempotencyStore } from "./idempotency/idempotency";
export type { Clock } from "./time/clock";
export { systemClock } from "./time/clock";
export { DomainError } from "./errors/domain-error";
