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
export {
  COMPOSER_ACTIONS,
  validateComposerPayload,
} from "./messaging/composer-actions.js";
export type {
  ComposerAction,
  ComposerCapabilitySet,
  ComposerPayload,
  DocumentAttachmentPayload,
  GalleryAttachmentPayload,
  CatalogueReferencePayload,
  QuickReplyPayload,
  LocationPayload,
  ContactPayload,
  PollPayload,
  EventPayload,
} from "./messaging/composer-actions.js";
export {
  createComposerState,
  setComposerDraft,
  openComposerActions,
  closeComposerActions,
  selectComposerAction,
  attachComposerPayload,
  cancelComposerAction,
  confirmComposerAction,
  defaultComposerCapabilities,
} from "./messaging/composer-state.js";
export type { ComposerState } from "./messaging/composer-state.js";
