import type { ComposerAction, ComposerCapabilitySet, ComposerPayload } from "./composer-actions.js";

export interface ComposerState {
  readonly draftText: string;
  readonly actionMenuOpen: boolean;
  readonly activeAction: ComposerAction | null;
  readonly capabilities: ComposerCapabilitySet;
  readonly pendingPayload: ComposerPayload | null;
}

export const defaultComposerCapabilities: ComposerCapabilitySet = Object.freeze({
  document: true,
  gallery: true,
  catalogue: true,
  quickReply: true,
  location: true,
  contact: true,
  poll: true,
  event: true,
});

export function createComposerState(
  draftText = "",
  capabilities: ComposerCapabilitySet = defaultComposerCapabilities,
): ComposerState {
  return Object.freeze({
    draftText,
    actionMenuOpen: false,
    activeAction: null,
    capabilities,
    pendingPayload: null,
  });
}

export function setComposerDraft(state: ComposerState, draftText: string): ComposerState {
  return Object.freeze({ ...state, draftText });
}

export function openComposerActions(state: ComposerState): ComposerState {
  return Object.freeze({ ...state, actionMenuOpen: true });
}

export function closeComposerActions(state: ComposerState): ComposerState {
  return Object.freeze({
    ...state,
    actionMenuOpen: false,
    activeAction: null,
    pendingPayload: null,
  });
}

export function selectComposerAction(
  state: ComposerState,
  action: ComposerAction,
): ComposerState {
  const capabilityKey: keyof ComposerCapabilitySet = action === "quick_reply" ? "quickReply" : action;
  if (!state.capabilities[capabilityKey]) {
    throw new Error(`Composer action is not available: ${action}`);
  }

  return Object.freeze({
    ...state,
    actionMenuOpen: true,
    activeAction: action,
    pendingPayload: null,
  });
}

export function attachComposerPayload(
  state: ComposerState,
  payload: ComposerPayload,
): ComposerState {
  if (state.activeAction !== payload.action) {
    throw new Error("Composer payload does not match the active action");
  }

  return Object.freeze({ ...state, pendingPayload: payload });
}

export function cancelComposerAction(state: ComposerState): ComposerState {
  return Object.freeze({
    ...state,
    actionMenuOpen: false,
    activeAction: null,
    pendingPayload: null,
  });
}

export function confirmComposerAction(state: ComposerState): ComposerState {
  if (state.activeAction === null || state.pendingPayload === null) {
    throw new Error("No composer action is ready to confirm");
  }

  return Object.freeze({
    ...state,
    actionMenuOpen: false,
    activeAction: null,
    pendingPayload: null,
  });
}
