# HopeHouse — Messaging Composer Actions

## Status
Normative implementation contract

## Objective

The HopeHouse messaging composer must provide a WhatsApp-like attachment/action tray without coupling Messaging to the ownership domain of the attached resource.

The composer keeps the primary text/audio input visible and exposes a secondary action grid when the attachment/action control is opened.

## Composer baseline

The composer contains:

- text input;
- emoji/sticker entry point;
- attachment/action button;
- camera entry point;
- voice recording button;
- send button when text or a prepared payload is ready.

The action tray is opened from the attachment/action button and is dismissible without losing the draft.

## Action grid

The first implementation must expose these actions:

| Action | Purpose | Owning domain |
|---|---|---|
| Document | Select and send a document/file | Media & Storage |
| Gallery | Select and send image/video media | Media & Storage |
| Catalogue | Attach a catalogue/product reference | Commerce/Catalogue |
| Réponse rapide | Insert a configured quick-reply template | Messaging / Configuration |
| Localisation | Send a point or shared live location | Location |
| Contact | Share a contact reference/card | Identity / Contacts |
| Sondage | Create and send a poll | Messaging |
| Événement | Create and send an event/meeting invitation | Calendar/Meetings |

These actions are payload producers. They do not directly mutate another domain's persistence model.

## Payload contracts

Every composer action produces a typed message payload and a normal Messaging message envelope.

### Document

Contains an opaque `mediaFileId`, filename, MIME type, size and optional caption. Binary storage remains owned by Media & Storage.

### Gallery

Contains one or more opaque media references, media type, dimensions/duration when known, and optional caption. The client may preview media before sending.

### Catalogue

Contains an opaque catalogue/product reference, display snapshot fields required for rendering, and the owning resource version. Messaging must not become the source of truth for product data.

### Réponse rapide

Contains a quick-reply/template reference and the rendered text snapshot used at send time. Template configuration remains separately owned and versioned.

### Localisation

Contains latitude, longitude, optional accuracy, optional label/address and an explicit `sharingMode` (`point` or `live`). Live-location state must have an expiration time and must never be inferred from a normal point payload.

### Contact

Contains an opaque contact/user reference and a display snapshot suitable for rendering. Sensitive identity data must be minimized.

### Sondage

Contains question, ordered options, selection policy, anonymous/membership policy and closing time when configured. Poll votes are modeled as Messaging-owned state and must be idempotent.

### Événement

Contains title, start/end time, timezone, optional location/link, description, organizer reference and RSVP policy. Calendar ownership remains outside Messaging where a dedicated Calendar/Meetings domain exists.

## UX requirements

The action tray should visually follow the supplied WhatsApp reference:

- rounded composer container;
- compact icon buttons with labels;
- two-column or four-column responsive grid depending on available width;
- distinct icons for each action;
- no action should replace or destroy the current draft;
- unavailable actions are hidden or disabled according to server-provided capabilities;
- permissions are always enforced server-side even when the UI hides an action.

The initial grid order is:

1. Document
2. Gallery
3. Catalogue
4. Réponse rapide
5. Localisation
6. Contact
7. Sondage
8. Événement

The visual treatment is inspired by the supplied reference image, but the implementation remains HopeHouse-owned and must not copy proprietary assets.

## Server capabilities

The frontend must obtain an explicit capability set for the current user/conversation. Example capabilities include:

- `message.document.send`
- `message.media.send`
- `message.catalogue.send`
- `message.quick_reply.use`
- `message.location.send`
- `message.contact.share`
- `message.poll.create`
- `message.event.create`

Capabilities are advisory for UI rendering. The server remains authoritative.

## Security and privacy

- Never trust a client-provided role or capability.
- Validate every referenced resource on the server.
- Do not put secrets, access tokens or private provider credentials in message payloads.
- Location sharing must be explicit and revocable where applicable.
- Contact sharing must respect identity visibility rules.
- Administrative access, exports, reports, privacy changes and sensitive actions are audited.

## Events

The composer actions integrate with the shared event envelope and Outbox. Examples:

- `MessageCreated`
- `MessageMediaAttached`
- `MessagePollCreated`
- `MessageEventCreated`
- `MessageLocationShared`
- `MessageContactShared`

The event payload is owned by the publishing domain; the shared kernel transports metadata and reliability semantics.

## Implementation order

1. Define TypeScript payload contracts and validation.
2. Add server-side capability resolution.
3. Add Messaging message/action command contracts.
4. Add tests for validation, authorization and idempotency.
5. Add Prisma models only after the bounded-context model is approved.
6. Add the frontend composer/action tray.
7. Add WebSocket events and delivery state.

No Messaging table should be added solely to reproduce the visual action tray before the corresponding domain ownership and payload contract are approved.
