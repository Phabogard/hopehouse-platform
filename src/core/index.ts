export type { Entity, UniqueId } from "./domain/entity.js";
export { BaseEntity } from "./domain/entity.js";
export type { DomainEvent, DomainEventEnvelope } from "./events/domain-event.js";
export type {
  OutboxMessage,
  OutboxStore,
  EventPublisher,
  OutboxRelayOptions,
} from "./outbox/outbox.js";
export { OutboxRelay, calculateExponentialBackoff } from "./outbox/outbox.js";
export { ConcurrencyConflictError, assertExpectedVersion } from "./concurrency/optimistic-concurrency.js";
export type { VersionedAggregate } from "./concurrency/optimistic-concurrency.js";
export type { IdempotencyRecord, IdempotencyStore } from "./idempotency/idempotency.js";
export type { Clock } from "./time/clock.js";
export { systemClock } from "./time/clock.js";
export {
  DomainError,
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
} from "./errors.js";
