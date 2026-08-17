import { describe, expect, it } from "vitest";
import {
  DomainError,
  assertExpectedVersion,
  ConcurrencyConflictError,
  systemClock,
  type DomainEvent,
} from "../../src/core";

describe("shared kernel", () => {
  it("accepts a matching optimistic concurrency version", () => {
    expect(() => assertExpectedVersion(3, 3)).not.toThrow();
  });

  it("rejects a stale optimistic concurrency version", () => {
    expect(() => assertExpectedVersion(3, 4)).toThrow(ConcurrencyConflictError);
  });

  it("provides an injectable system clock", () => {
    expect(systemClock.now()).toBeInstanceOf(Date);
  });

  it("preserves the domain event envelope contract", () => {
    const event: DomainEvent<{ value: number }> = {
      eventId: "evt-1",
      eventType: "ExampleCreated",
      schemaVersion: 1,
      occurredAt: new Date().toISOString(),
      correlationId: "corr-1",
      causationId: null,
      aggregateId: "agg-1",
      aggregateType: "Example",
      payload: { value: 1 },
    };

    expect(event.payload.value).toBe(1);
    expect(event.schemaVersion).toBe(1);
  });

  it("represents domain failures without infrastructure details", () => {
    const error = new DomainError("Invalid state", "INVALID_STATE", { state: "x" });
    expect(error.code).toBe("INVALID_STATE");
    expect(error.details).toEqual({ state: "x" });
  });
});
