import type { Actor } from "../rbac/authorize.js";
import {
  COMPOSER_ACTIONS,
  type ComposerAction,
  type ComposerCapabilitySet,
} from "../../core/messaging/composer-actions.js";

export interface ComposerActionDefinition {
  readonly action: ComposerAction;
  readonly label: string;
  readonly icon: string;
  readonly owner: string;
  readonly capabilityKey: keyof ComposerCapabilitySet;
}

export const composerActionDefinitions: readonly ComposerActionDefinition[] = Object.freeze([
  { action: "document", label: "Document", icon: "file-text", owner: "Media & Storage", capabilityKey: "document" },
  { action: "gallery", label: "Galerie", icon: "image", owner: "Media & Storage", capabilityKey: "gallery" },
  { action: "catalogue", label: "Catalogue", icon: "store", owner: "Catalogue / Services", capabilityKey: "catalogue" },
  { action: "quick_reply", label: "Réponse rapide", icon: "zap", owner: "Messaging / Templates", capabilityKey: "quickReply" },
  { action: "location", label: "Localisation", icon: "map-pin", owner: "Location", capabilityKey: "location" },
  { action: "contact", label: "Contact", icon: "user", owner: "Identity / Contacts", capabilityKey: "contact" },
  { action: "poll", label: "Sondage", icon: "list-checks", owner: "Messaging", capabilityKey: "poll" },
  { action: "event", label: "Événement", icon: "calendar-days", owner: "Calendar / Events", capabilityKey: "event" },
]);

export interface ComposerManifest {
  readonly actions: readonly ComposerActionDefinition[];
  readonly capabilities: ComposerCapabilitySet;
}

export function buildComposerManifest(
  _actor: Actor,
  capabilities: ComposerCapabilitySet,
): ComposerManifest {
  const actions = composerActionDefinitions.filter(
    (definition) => capabilities[definition.capabilityKey],
  );

  return Object.freeze({
    actions,
    capabilities,
  });
}

export function isComposerAction(value: string): value is ComposerAction {
  return (COMPOSER_ACTIONS as readonly string[]).includes(value);
}
