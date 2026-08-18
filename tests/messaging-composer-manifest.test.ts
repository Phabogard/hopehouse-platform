import assert from "node:assert/strict";
import test from "node:test";
import { buildComposerManifest, composerActionDefinitions, isComposerAction } from "../src/modules/messaging/composer-capabilities.js";
import { defaultComposerCapabilities } from "../src/core/messaging/composer-state.js";
import type { Actor } from "../src/modules/rbac/authorize.js";

const actor: Actor = { id: "client-1", role: "client" };

test("composer manifest exposes the eight actions in screen order", () => {
  const manifest = buildComposerManifest(actor, defaultComposerCapabilities);

  assert.deepEqual(
    manifest.actions.map((action) => action.action),
    ["document", "gallery", "catalogue", "quick_reply", "location", "contact", "poll", "event"],
  );
  assert.equal(composerActionDefinitions.length, 8);
});

test("composer manifest filters disabled capabilities", () => {
  const manifest = buildComposerManifest(actor, {
    ...defaultComposerCapabilities,
    catalogue: false,
    event: false,
  });

  assert.equal(manifest.actions.some((action) => action.action === "catalogue"), false);
  assert.equal(manifest.actions.some((action) => action.action === "event"), false);
  assert.equal(manifest.actions.length, 6);
});

test("composer action validation is strict", () => {
  assert.equal(isComposerAction("gallery"), true);
  assert.equal(isComposerAction("unknown"), false);
});
