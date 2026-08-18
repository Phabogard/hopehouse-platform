import type { UniqueId } from "../domain/entity.js";

export const COMPOSER_ACTIONS = [
  "document",
  "gallery",
  "catalogue",
  "quick_reply",
  "location",
  "contact",
  "poll",
  "event",
] as const;

export type ComposerAction = (typeof COMPOSER_ACTIONS)[number];

export interface DocumentAttachmentPayload {
  readonly mediaFileId: UniqueId;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly caption?: string;
}

export interface GalleryAttachmentPayload {
  readonly mediaFileIds: readonly UniqueId[];
  readonly caption?: string;
}

export interface CatalogueReferencePayload {
  readonly catalogueItemId: UniqueId;
  readonly catalogueVersion: number;
  readonly title: string;
  readonly imageMediaFileId?: UniqueId;
}

export interface QuickReplyPayload {
  readonly templateId: UniqueId;
  readonly templateVersion: number;
  readonly renderedText: string;
}

export interface LocationPayload {
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracyMeters?: number;
  readonly label?: string;
  readonly sharingMode: "point" | "live";
  readonly expiresAt?: string;
}

export interface ContactPayload {
  readonly contactId: UniqueId;
  readonly displayName: string;
}

export interface PollPayload {
  readonly question: string;
  readonly options: readonly string[];
  readonly multipleAnswers: boolean;
  readonly anonymous: boolean;
  readonly closesAt?: string;
}

export interface EventPayload {
  readonly eventId: UniqueId;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timezone: string;
  readonly locationLabel?: string;
  readonly meetingUrl?: string;
  readonly description?: string;
}

export type ComposerPayload =
  | { readonly action: "document"; readonly payload: DocumentAttachmentPayload }
  | { readonly action: "gallery"; readonly payload: GalleryAttachmentPayload }
  | { readonly action: "catalogue"; readonly payload: CatalogueReferencePayload }
  | { readonly action: "quick_reply"; readonly payload: QuickReplyPayload }
  | { readonly action: "location"; readonly payload: LocationPayload }
  | { readonly action: "contact"; readonly payload: ContactPayload }
  | { readonly action: "poll"; readonly payload: PollPayload }
  | { readonly action: "event"; readonly payload: EventPayload };

export interface ComposerCapabilitySet {
  readonly document: boolean;
  readonly gallery: boolean;
  readonly catalogue: boolean;
  readonly quickReply: boolean;
  readonly location: boolean;
  readonly contact: boolean;
  readonly poll: boolean;
  readonly event: boolean;
}

export function validateComposerPayload(input: ComposerPayload): void {
  switch (input.action) {
    case "document":
      if (!input.payload.mediaFileId || !input.payload.fileName || !input.payload.mimeType) {
        throw new Error("Invalid document attachment payload");
      }
      if (!Number.isSafeInteger(input.payload.sizeBytes) || input.payload.sizeBytes < 0) {
        throw new Error("Invalid document size");
      }
      return;

    case "gallery":
      if (input.payload.mediaFileIds.length === 0) {
        throw new Error("Gallery attachment must contain at least one media file");
      }
      return;

    case "catalogue":
      if (!input.payload.catalogueItemId || !Number.isSafeInteger(input.payload.catalogueVersion) || input.payload.catalogueVersion < 1) {
        throw new Error("Invalid catalogue reference");
      }
      return;

    case "quick_reply":
      if (!input.payload.templateId || !Number.isSafeInteger(input.payload.templateVersion) || input.payload.templateVersion < 1 || !input.payload.renderedText.trim()) {
        throw new Error("Invalid quick reply payload");
      }
      return;

    case "location":
      if (input.payload.latitude < -90 || input.payload.latitude > 90 || input.payload.longitude < -180 || input.payload.longitude > 180) {
        throw new Error("Invalid location coordinates");
      }
      if (input.payload.sharingMode === "live" && !input.payload.expiresAt) {
        throw new Error("Live location requires an expiration time");
      }
      return;

    case "contact":
      if (!input.payload.contactId || !input.payload.displayName.trim()) {
        throw new Error("Invalid contact payload");
      }
      return;

    case "poll":
      if (!input.payload.question.trim() || input.payload.options.length < 2) {
        throw new Error("A poll requires a question and at least two options");
      }
      return;

    case "event":
      if (!input.payload.eventId || !input.payload.title.trim() || !input.payload.startsAt || !input.payload.endsAt || !input.payload.timezone) {
        throw new Error("Invalid event payload");
      }
      return;
  }
}
