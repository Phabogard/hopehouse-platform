import type { DomainEventEnvelope, DomainEvent } from '../../core/events/domain-event.js';

/**
 * Payload for the WalletCredited domain event.
 *
 * Contains only the data a downstream consumer needs to react to a credit
 * (e.g. notifications, accounting projections). It intentionally excludes
 * internal persistence details (e.g. idempotency keys) that are not part of
 * the domain fact being announced.
 */
export interface WalletCreditedPayload {
  readonly walletId: string;
  readonly transactionId: string;
  readonly currency: string;
  readonly amountCents: number;
  readonly actorId: string;
  readonly relatedEntityType: string | null;
  readonly relatedEntityId: string | null;
}

export const WALLET_CREDITED_EVENT_TYPE = 'wallet.credited';
export const WALLET_CREDITED_SCHEMA_VERSION = 1;
export const WALLET_AGGREGATE_TYPE = 'Wallet';

export interface CreateWalletCreditedEventInput {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly payload: WalletCreditedPayload;
}

/**
 * Builds a WalletCredited event conforming to the existing DomainEventEnvelope
 * contract (see src/core/events/domain-event.ts). No new envelope shape is
 * introduced.
 */
export function createWalletCreditedEvent(
  input: CreateWalletCreditedEventInput,
): DomainEvent<WalletCreditedPayload> {
  const event: DomainEventEnvelope<WalletCreditedPayload> = {
    eventId: input.eventId,
    eventType: WALLET_CREDITED_EVENT_TYPE,
    schemaVersion: WALLET_CREDITED_SCHEMA_VERSION,
    occurredAt: input.occurredAt,
    correlationId: input.correlationId,
    causationId: input.causationId,
    aggregateId: input.payload.walletId,
    aggregateType: WALLET_AGGREGATE_TYPE,
    payload: input.payload,
  };
  return event;
}
