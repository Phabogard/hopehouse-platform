import assert from "node:assert/strict";
import test from "node:test";
import {
  attachComposerPayload,
  cancelComposerAction,
  createComposerState,
  openComposerActions,
  selectComposerAction,
  setComposerDraft,
} from "../../src/core/messaging/composer-state.js";

test("opening the action panel never loses the draft", () => {
  const initial = createComposerState("Bonjour Jasmine");
  const opened = openComposerActions(initial);

  assert.equal(opened.draftText, "Bonjour Jasmine");
  assert.equal(opened.actionMenuOpen, true);
});

test("selecting and cancelling an action preserves the message draft", () => {
  const initial = createComposerState("Message en cours");
  const selected = selectComposerAction(openComposerActions(initial), "gallery");
  const cancelled = cancelComposerAction(selected);

  assert.equal(cancelled.draftText, "Message en cours");
  assert.equal(cancelled.actionMenuOpen, false);
  assert.equal(cancelled.activeAction, null);
  assert.equal(cancelled.pendingPayload, null);
});

test("an action payload must match the selected action", () => {
  const state = selectComposerAction(openComposerActions(createComposerState("")), "contact");

  assert.throws(() => attachComposerPayload(state, {
    action: "poll",
    payload: {
      question: "Choix",
      options: ["A", "B"],
      multipleAnswers: false,
      anonymous: false,
    },
  }), /active action/);
});

test("composer draft can be edited independently of action selection", () => {
  const initial = selectComposerAction(openComposerActions(createComposerState("")), "document");
  const updated = setComposerDraft(initial, "Voici le document demandé");

  assert.equal(updated.activeAction, "document");
  assert.equal(updated.draftText, "Voici le document demandé");
});

test("disabled capabilities prevent selecting an unavailable action", () => {
  const state = createComposerState("", {
    document: true,
    gallery: false,
    catalogue: true,
    quickReply: true,
    location: true,
    contact: true,
    poll: true,
    event: true,
  });

  assert.throws(() => selectComposerAction(openComposerActions(state), "gallery"), /not available/);
});
