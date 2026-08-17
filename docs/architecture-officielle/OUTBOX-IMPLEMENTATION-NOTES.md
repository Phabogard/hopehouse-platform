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

The Outbox migration is deliberately introduced before adding a generated Prisma model because the current Prisma schema is an authentication/security contract and is not yet the final cross-domain schema. Before this migration is treated as production-ready, the final Prisma schema must represent the Outbox table or explicitly preserve it as an intentionally unmanaged table. A future Prisma migration must never silently drop `outbox_messages`.

## Not implemented yet

- relay worker;
- row locking/claim implementation;
- retry backoff policy;
- dead-letter policy;
- transactional domain repository integration;
- Prisma generated model.

These are intentionally deferred until the event transport and domain boundaries are reviewed.
