import assert from "node:assert/strict";
import test from "node:test";
import { validateComposerPayload } from "../../src/core/messaging/composer-actions.js";

test("accepts a document composer payload", () => {
  assert.doesNotThrow(() => validateComposerPayload({
    action: "document",
    payload: {
      mediaFileId: "media-1",
      fileName: "contract.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
    },
  }));
});

test("rejects live location without expiration", () => {
  assert.throws(() => validateComposerPayload({
    action: "location",
    payload: {
      latitude: 0,
      longitude: 0,
      sharingMode: "live",
    },
  }), /expiration/);
});

test("rejects a poll with fewer than two options", () => {
  assert.throws(() => validateComposerPayload({
    action: "poll",
    payload: {
      question: "Choose one",
      options: ["Only one"],
      multipleAnswers: false,
      anonymous: false,
    },
  }), /at least two options/);
});

test("rejects invalid coordinates", () => {
  assert.throws(() => validateComposerPayload({
    action: "location",
    payload: {
      latitude: 91,
      longitude: 0,
      sharingMode: "point",
    },
  }), /coordinates/);
});

test("accepts an event payload", () => {
  assert.doesNotThrow(() => validateComposerPayload({
    action: "event",
    payload: {
      eventId: "event-1",
      title: "Réunion",
      startsAt: "2026-08-20T10:00:00Z",
      endsAt: "2026-08-20T11:00:00Z",
      timezone: "Africa/Kinshasa",
    },
  }));
});
