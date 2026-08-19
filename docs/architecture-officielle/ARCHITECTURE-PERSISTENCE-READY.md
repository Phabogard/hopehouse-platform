# Persistence implementation gate

This document records the implementation gate for the transition from in-memory domain state to PostgreSQL persistence.

## Required prerequisites

1. The transactional outbox table is represented in `prisma/schema.prisma` so domain mutations can insert outbox rows through the same Prisma transaction client used by the mutation.
2. Outbox claiming and lease handling remain in the dedicated PostgreSQL adapter because they require SQL features not expressed by Prisma's model API.
3. Audit records are durable and append-only before financial domain persistence is introduced.
4. Wallet idempotency and optimistic concurrency are enforced by PostgreSQL constraints and conditional writes, not process-local state.
5. Wallet mutation and its corresponding outbox event are committed atomically in one database transaction.

## Implementation order

Outbox Prisma model -> durable audit -> wallet persistence -> order persistence -> payment persistence -> simple catalog persistence -> API wiring.

No external event transport or production relay worker should be introduced before domain code actually writes transactional outbox messages.
