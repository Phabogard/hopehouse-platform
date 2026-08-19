# Outbox implementation boundary

The shared-kernel Outbox is the reliability boundary for cross-domain event publication.

## Current step

This branch introduces:

- the domain-level Outbox contracts;
- the PostgreSQL `outbox_messages` migration;
- indexes for pending delivery, correlation tracing, aggregate history, and event type.

## Transaction rule

A domain command that changes state and emits an event must persist both the domain state and the Outbox record in the same PostgreSQL transaction.

The relay is responsible for claiming pending records, publishing them, and marking them published. A failed publication must remain retryable. Consumers must be idempotent because publication is at-least-once.

## Important Prisma guardrail

The Prisma schema now mirrors the `outbox_messages` table columns and the non-partial indexes that Prisma can represent without semantic loss. The PostgreSQL migration remains the source of truth for `outbox_messages_pending_idx` and `outbox_messages_lease_idx` because both are partial indexes with `WHERE published_at IS NULL`, which Prisma cannot represent as ordinary `@@index` definitions. A future Prisma migration must never silently drop or widen those partial indexes.

## Not implemented yet

- production relay worker;
- dead-letter policy;
- transactional domain repository integration.

These are intentionally deferred until the event transport and domain boundaries are reviewed.
