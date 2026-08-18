import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DomainError } from "../../src/core/errors.js";
import {
  assertExpectedVersion,
  ConcurrencyConflictError,
  systemClock,
  type DomainEvent,
} from "../../src/core/index.js";

describe("shared kernel", () => {
  it("accepts a matching optimistic concurrency version", () => {
    assert.doesNotThrow(() => assertExpectedVersion(3, 3));
  });

  it("rejects a stale optimistic concurrency version", () => {
    assert.throws(() => assertExpectedVersion(3, 4), ConcurrencyConflictError);
  });

  it("provides an injectable system clock", () => {
    assert.ok(systemClock.now() instanceof Date);
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

    assert.equal(event.payload.value, 1);
    assert.equal(event.schemaVersion, 1);
  });

  it("represents domain failures without infrastructure details", () => {
    const error = new DomainError("Invalid state", "INVALID_STATE", 400, { state: "x" });
    assert.equal(error.message, "Invalid state");
    assert.equal(error.code, "INVALID_STATE");
    assert.equal(error.statusCode, 400);
    assert.deepEqual(error.details, { state: "x" });
  });
});
