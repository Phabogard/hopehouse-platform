# HopeHouse Outbox Relay Contract

## Status
Proposed

## Processing model

The relay provides at-least-once publication. Consumers MUST be idempotent. The relay MUST NOT claim that broker publication and database acknowledgement form an exactly-once distributed transaction.

## Claiming

The PostgreSQL adapter must claim pending rows inside a short transaction using row locking equivalent to:

```sql
SELECT ...
FROM outbox_messages
WHERE published_at IS NULL
  AND available_at <= now()
ORDER BY created_at, event_id
FOR UPDATE SKIP LOCKED
LIMIT $1;
```

Claimed rows must receive an ownership/lease mechanism before the transaction commits. The lease prevents two active workers from processing the same row concurrently while allowing recovery after a worker crash.

## Publication lifecycle

`pending -> claimed -> published`

On failure:

`claimed -> pending` with incremented `attempts`, `last_error`, and a future `available_at`.

A message is considered published only after the publisher confirms successful handoff to the configured transport.

## Retry

Use bounded exponential backoff. Retry policy must be configurable. After the maximum attempts, the message is not silently deleted; it becomes an operational failure requiring monitoring/recovery policy.

## Idempotency

The event ID is the primary idempotency identity. Downstream consumers must persist or otherwise atomically enforce processed-event identity before applying non-idempotent effects.

## Failure semantics

If a worker crashes after publication but before `published_at` is persisted, the same event may be published again. This is expected under at-least-once delivery and is why consumers must be idempotent.

## Scope

This contract is infrastructure-level. Messaging, IA, Notifications, Search, Audit and other domains own their event payloads and business behavior; the relay only transports versioned event envelopes.
