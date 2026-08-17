import { describe, expect, it, vi } from "vitest";
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
    expect(calculateExponentialBackoff(0)).toBe(1_000);
    expect(calculateExponentialBackoff(1)).toBe(2_000);
    expect(calculateExponentialBackoff(10)).toBe(1_024_000);
    expect(calculateExponentialBackoff(100)).toBe(1_024_000);
  });

  it("publishes claimed messages and marks them published", async () => {
    const store: OutboxStore = {
      claimBatch: vi.fn().mockResolvedValue([message]),
      markPublished: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
    };
    const publisher: EventPublisher = {
      publish: vi.fn().mockResolvedValue(undefined),
    };

    const count = await new OutboxRelay(store, publisher).processBatch(new Date(1_000));

    expect(count).toBe(1);
    expect(publisher.publish).toHaveBeenCalledWith(message);
    expect(store.markPublished).toHaveBeenCalledTimes(1);
    expect(store.markFailed).not.toHaveBeenCalled();
  });

  it("records a retry after publication failure", async () => {
    const store: OutboxStore = {
      claimBatch: vi.fn().mockResolvedValue([{ ...message, attempts: 1 }]),
      markPublished: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
    };
    const publisher: EventPublisher = {
      publish: vi.fn().mockRejectedValue(new Error("broker unavailable")),
    };

    const count = await new OutboxRelay(store, publisher).processBatch(new Date(1_000));

    expect(count).toBe(0);
    expect(store.markFailed).toHaveBeenCalledTimes(1);
    expect(store.markFailed.mock.calls[0]?.[0]).toBe("evt-1");
    expect(store.markFailed.mock.calls[0]?.[1]).toBeInstanceOf(Error);
    expect(store.markFailed.mock.calls[0]?.[2]).toEqual(new Date(3_000));
  });
});
