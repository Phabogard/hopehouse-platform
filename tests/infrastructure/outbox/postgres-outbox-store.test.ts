import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DomainEventEnvelope } from "../../../src/core/events/domain-event.js";
import { PostgresOutboxStore } from "../../../src/infrastructure/outbox/postgres-outbox-store.js";

type Call = { query: string; values: unknown[] };

describe("PostgresOutboxStore.append", () => {
  it("persists the complete event envelope with an explicit availability time", async () => {
    const calls: Call[] = [];
    const db = {
      $queryRawUnsafe: async <T = unknown>(query: string, ...values: unknown[]) => {
        calls.push({ query, values });
        return [] as T;
      },
    };

    const store = new PostgresOutboxStore(db);
    const event: DomainEventEnvelope<{ amount: number }> = {
      eventId: "evt-1",
      eventType: "WalletCredited",
      schemaVersion: 1,
      occurredAt: "2026-08-22T12:00:00.000Z",
      correlationId: "corr-1",
      causationId: "cause-1",
      aggregateId: "wallet-1",
      aggregateType: "Wallet",
      payload: { amount: 500 },
    };
    const availableAt = new Date("2026-08-22T12:01:00.000Z");

    await store.append(event, availableAt);

    assert.equal(calls.length, 1);
    assert.match(calls[0].query, /INSERT INTO outbox_messages/);
    assert.match(calls[0].query, /event_type/);
    assert.match(calls[0].query, /payload_json/);
    assert.deepEqual(calls[0].values, [
      "evt-1",
      "WalletCredited",
      1,
      new Date("2026-08-22T12:00:00.000Z"),
      "corr-1",
      "cause-1",
      "wallet-1",
      "Wallet",
      JSON.stringify({ amount: 500 }),
      availableAt,
    ]);
  });

  it("uses occurredAt as the default availability time", async () => {
    const calls: Call[] = [];
    const db = {
      $queryRawUnsafe: async <T = unknown>(query: string, ...values: unknown[]) => {
        calls.push({ query, values });
        return [] as T;
      },
    };

    const store = new PostgresOutboxStore(db);
    const event: DomainEventEnvelope = {
      eventId: "evt-2",
      eventType: "ExampleCreated",
      schemaVersion: 2,
      occurredAt: "2026-08-22T13:00:00.000Z",
      correlationId: "corr-2",
      causationId: null,
      aggregateId: "agg-2",
      aggregateType: "Example",
      payload: { value: 2 },
    };

    await store.append(event);

    assert.deepEqual(calls[0].values.at(-1), new Date("2026-08-22T13:00:00.000Z"));
  });

  it("does not swallow database errors", async () => {
    const expected = new Error("duplicate event id");
    const db = {
      $queryRawUnsafe: async () => {
        throw expected;
      },
    };

    const store = new PostgresOutboxStore(db);
    const event: DomainEventEnvelope = {
      eventId: "evt-3",
      eventType: "ExampleCreated",
      schemaVersion: 1,
      occurredAt: "2026-08-22T14:00:00.000Z",
      correlationId: "corr-3",
      causationId: null,
      aggregateId: "agg-3",
      aggregateType: "Example",
      payload: {},
    };

    await assert.rejects(() => store.append(event), expected);
  });
});

describe("PostgresOutboxStore delivery lifecycle", () => {
  it("claims eligible rows atomically and maps their persisted state", async () => {
    const calls: Call[] = [];
    const claimedAt = new Date("2026-08-22T15:00:00.000Z");
    const db = {
      $queryRawUnsafe: async <T = unknown>(query: string, ...values: unknown[]) => {
        calls.push({ query, values });
        return [{
          id: "evt-4",
          event_type: "ExampleCreated",
          schema_version: 3,
          occurred_at: new Date("2026-08-22T14:00:00.000Z"),
          correlation_id: "corr-4",
          causation_id: null,
          aggregate_id: "aggregate-4",
          aggregate_type: "Example",
          payload_json: { enabled: true },
          attempts: 2,
          available_at: claimedAt,
          published_at: null,
          last_error: "temporary failure",
          lease_owner: "worker-1",
          lease_until: new Date("2026-08-22T15:00:30.000Z"),
        }] as T;
      },
    };

    const messages = await new PostgresOutboxStore<{ enabled: boolean }>(db).claimBatch(
      10,
      claimedAt,
      "worker-1",
      30_000,
    );

    assert.equal(calls.length, 1);
    assert.match(calls[0].query, /FOR UPDATE SKIP LOCKED/);
    assert.match(calls[0].query, /UPDATE outbox_messages/);
    assert.deepEqual(calls[0].values, [claimedAt, 10, "worker-1", 30_000]);
    assert.deepEqual(messages, [{
      eventId: "evt-4",
      eventType: "ExampleCreated",
      schemaVersion: 3,
      occurredAt: "2026-08-22T14:00:00.000Z",
      correlationId: "corr-4",
      causationId: null,
      aggregateId: "aggregate-4",
      aggregateType: "Example",
      payload: { enabled: true },
      attempts: 2,
      availableAt: "2026-08-22T15:00:00.000Z",
      publishedAt: null,
      lastError: "temporary failure",
      leaseOwner: "worker-1",
      leaseUntil: "2026-08-22T15:00:30.000Z",
    }]);
  });

  it("rejects invalid claim parameters before issuing SQL", async () => {
    let calls = 0;
    const store = new PostgresOutboxStore({
      $queryRawUnsafe: async <T = unknown>() => {
        calls += 1;
        return [] as T;
      },
    });

    await assert.rejects(() => store.claimBatch(0, new Date(), "worker-1", 30_000), /positive integer/);
    await assert.rejects(() => store.claimBatch(1, new Date("invalid"), "worker-1", 30_000), /claim timestamp/);
    await assert.rejects(() => store.claimBatch(1, new Date(), "   ", 30_000), /workerId/);
    await assert.rejects(() => store.claimBatch(1, new Date(), "worker-1", 0), /positive safe integer/);
    assert.equal(calls, 0);
  });

  it("updates only rows leased by the current worker when publishing or retrying", async () => {
    const calls: Call[] = [];
    const db = {
      $queryRawUnsafe: async <T = unknown>(query: string, ...values: unknown[]) => {
        calls.push({ query, values });
        return [] as T;
      },
    };
    const store = new PostgresOutboxStore(db);
    const publishedAt = new Date("2026-08-22T16:00:00.000Z");
    const nextAttemptAt = new Date("2026-08-22T16:01:00.000Z");

    await store.markPublished("evt-5", "worker-2", publishedAt);
    await store.markFailed("evt-6", "worker-2", new Error("broker unavailable"), nextAttemptAt);

    assert.match(calls[0].query, /published_at = \$3/);
    assert.match(calls[0].query, /lease_owner = \$2/);
    assert.deepEqual(calls[0].values, ["evt-5", "worker-2", publishedAt]);
    assert.match(calls[1].query, /attempts = attempts \+ 1/);
    assert.deepEqual(calls[1].values, ["evt-6", "worker-2", nextAttemptAt, "broker unavailable"]);
  });
});
