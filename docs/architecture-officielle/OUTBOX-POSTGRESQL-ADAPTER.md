# Outbox PostgreSQL adapter contract

## Status
Proposed implementation contract

## Transaction boundary

The business aggregate mutation and insertion of its Outbox message MUST occur in the same PostgreSQL transaction.

The relay MUST NOT mark a message as published before the external event transport has accepted the event.

## Claiming pending messages

A worker should claim eligible rows using a short PostgreSQL transaction with `FOR UPDATE SKIP LOCKED`. Claiming must not hold a database lock while the external transport is called.

Because publication and marking `published_at` are separate operations, the system is explicitly at-least-once. A worker crash after publication and before marking the row published can result in duplicate publication. Consumers MUST deduplicate using `eventId`/idempotency keys.

## Retry

On publish failure:

1. increment `attempts`;
2. store a bounded error summary in `last_error`;
3. compute a bounded exponential backoff;
4. set `available_at` to the next retry time;
5. release the claim.

A permanently failing message must become observable and eventually enter a dead-letter/quarantine workflow. It must not silently disappear.

## Security

Outbox payloads must not contain plaintext credentials, secrets, session tokens, refresh tokens, or provider API keys. Sensitive data must be represented by opaque references or redacted payload fields.

## Prisma compatibility

The current HopeHouse Prisma schema is intentionally not modified by this contract yet. The SQL migration is the source-of-truth candidate for the PostgreSQL table until the Prisma model is added after migration review.
