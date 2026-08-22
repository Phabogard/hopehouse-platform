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
