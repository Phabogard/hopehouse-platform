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

function isValidDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

export function validateComposerPayload(input: ComposerPayload): void {
  switch (input.action) {
    case "document":
      if (!input.payload.mediaFileId || !input.payload.fileName.trim() || !input.payload.mimeType.trim()) {
        throw new Error("Invalid document attachment payload");
      }
      if (!Number.isSafeInteger(input.payload.sizeBytes) || input.payload.sizeBytes < 0) {
        throw new Error("Invalid document size");
      }
      return;

    case "gallery":
      if (input.payload.mediaFileIds.length === 0 || input.payload.mediaFileIds.some((id) => !id)) {
        throw new Error("Gallery attachment must contain at least one media file");
      }
      return;

    case "catalogue":
      if (!input.payload.catalogueItemId || !Number.isSafeInteger(input.payload.catalogueVersion) || input.payload.catalogueVersion < 1 || !input.payload.title.trim()) {
        throw new Error("Invalid catalogue reference");
      }
      return;

    case "quick_reply":
      if (!input.payload.templateId || !Number.isSafeInteger(input.payload.templateVersion) || input.payload.templateVersion < 1 || !input.payload.renderedText.trim()) {
        throw new Error("Invalid quick reply payload");
      }
      return;

    case "location": {
      const { latitude, longitude, accuracyMeters, sharingMode, expiresAt } = input.payload;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        throw new Error("Invalid location coordinates");
      }
      if (accuracyMeters !== undefined && (!Number.isFinite(accuracyMeters) || accuracyMeters < 0)) {
        throw new Error("Invalid location accuracy");
      }
      if (sharingMode === "live" && (!expiresAt || !isValidDate(expiresAt) || Date.parse(expiresAt) <= Date.now())) {
        throw new Error("Live location requires a future expiration time");
      }
      if (sharingMode === "point" && expiresAt !== undefined && !isValidDate(expiresAt)) {
        throw new Error("Invalid location expiration time");
      }
      return;
    }

    case "contact":
      if (!input.payload.contactId || !input.payload.displayName.trim()) {
        throw new Error("Invalid contact payload");
      }
      return;

    case "poll": {
      const normalizedOptions = input.payload.options.map((option) => option.trim()).filter(Boolean);
      const uniqueOptions = new Set(normalizedOptions);
      if (!input.payload.question.trim() || normalizedOptions.length < 2 || uniqueOptions.size !== normalizedOptions.length) {
        throw new Error("A poll requires a question and at least two distinct options");
      }
      if (input.payload.closesAt !== undefined && (!isValidDate(input.payload.closesAt) || Date.parse(input.payload.closesAt) <= Date.now())) {
        throw new Error("Poll closing time must be in the future");
      }
      return;
    }

    case "event": {
      const { eventId, title, startsAt, endsAt, timezone } = input.payload;
      if (!eventId || !title.trim() || !timezone.trim() || !isValidDate(startsAt) || !isValidDate(endsAt) || Date.parse(endsAt) <= Date.parse(startsAt)) {
        throw new Error("Invalid event payload or event time range");
      }
      return;
    }
  }
}
