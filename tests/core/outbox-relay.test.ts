import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OutboxRelay,
  calculateExponentialBackoff,
  type EventPublisher,
  type OutboxMessage,
  type OutboxStore,
} from "../../src/core/outbox/outbox";

const message: OutboxMessage = {
  eventId: "evt-1",
  eventType: "ExampleCreated",
  schemaVersion: 1,
  occurredAt: new Date(0).toISOString(),
  correlationId: "corr-1",
  causationId: null,
  aggregateId: "agg-1",
  aggregateType: "Example",
  payload: { value: 1 },
  attempts: 0,
  availableAt: new Date(0).toISOString(),
  publishedAt: null,
  lastError: null,
};

describe("OutboxRelay", () => {
  it("uses bounded exponential backoff", () => {
    assert.equal(calculateExponentialBackoff(0), 1_000);
    assert.equal(calculateExponentialBackoff(1), 2_000);
    assert.equal(calculateExponentialBackoff(10), 1_024_000);
    assert.equal(calculateExponentialBackoff(100), 1_024_000);
  });

  it("publishes claimed messages and marks them published", async () => {
    const published: OutboxMessage[] = [];
    let publishedCount = 0;
    let failedCount = 0;
    const store: OutboxStore = {
      claimBatch: async () => [message],
      markPublished: async (eventId) => {
        publishedCount += 1;
        assert.equal(eventId, "evt-1");
      },
      markFailed: async () => {
        failedCount += 1;
      },
    };
    const publisher: EventPublisher = {
      publish: async (event) => {
        published.push(event);
      },
    };

    const count = await new OutboxRelay(store, publisher).processBatch(new Date(1_000));

    assert.equal(count, 1);
    assert.deepEqual(published, [message]);
    assert.equal(publishedCount, 1);
    assert.equal(failedCount, 0);
  });

  it("records a retry after publication failure", async () => {
    let failedEventId = "";
    let failedError: Error | undefined;
    let failedAt: Date | undefined;
    const store: OutboxStore = {
      claimBatch: async () => [{ ...message, attempts: 1 }],
      markPublished: async () => undefined,
      markFailed: async (eventId, error, nextAttemptAt) => {
        failedEventId = eventId;
        failedError = error;
        failedAt = nextAttemptAt;
      },
    };
    const publisher: EventPublisher = {
      publish: async () => {
        throw new Error("broker unavailable");
      },
    };

    const count = await new OutboxRelay(store, publisher).processBatch(new Date(1_000));

    assert.equal(count, 0);
    assert.equal(failedEventId, "evt-1");
    assert.ok(failedError instanceof Error);
    assert.deepEqual(failedAt, new Date(3_000));
  });
});
