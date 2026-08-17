# HopeHouse — Shared Kernel Consolidation

## Purpose

This document consolidates the reusable architectural primitives identified in the HopeHouse architecture and the NexaForge architecture. It does **not** import NexaForge business entities or duplicate HopeHouse domains.

## Ownership rule

One datum has one owning domain. Other domains use opaque references and versioned domain events. No domain writes directly to another domain's persistence model.

## Shared primitives

### Domain events

All cross-domain events use a common envelope containing:

- `eventId`
- `eventType`
- `schemaVersion`
- `occurredAt`
- `correlationId`
- `causationId`
- `aggregateId`
- `aggregateType`
- payload

Event payloads remain owned by the publishing domain.

### Outbox

A domain transaction may persist its business state and its outgoing event in the same database transaction through an Outbox record. A relay publishes committed Outbox records to the event transport. This is not a distributed transaction.

The Outbox must support idempotent processing and safe retries.

### Idempotency

Commands and externally retried event handlers must support an idempotency key where duplicate execution could create a second business effect.

### Optimistic concurrency

Aggregates that can be concurrently modified expose a version and accept an `expectedVersion`. A stale write fails with a concurrency conflict rather than silently overwriting a newer state.

### Append-only history

Security-sensitive and compliance-sensitive histories are append-only. Editing a message, prompt, role assignment, or audit record creates a new version/event rather than destroying the historical record.

### Audit

HopeHouse's Audit domain remains the single owner of audit records. The shared kernel provides correlation/causation metadata; domains publish auditable events. No second audit store is introduced from NexaForge.

### Time and identifiers

Domain code must depend on injectable clock/ID abstractions rather than calling infrastructure directly. UUID v7 is a candidate for new event identifiers and selected new aggregates, but adoption across existing identifiers requires a separate compatibility review.

### Result and domain errors

Domain/application code should return explicit results or domain errors rather than leaking infrastructure exceptions across domain boundaries.

## Domain ownership examples

| Information | Owner |
|---|---|
| User / identity | Identity & RBAC |
| Permission | Identity & RBAC |
| Organization | Organizations |
| Membership | Membership/Organizations boundary after final domain review |
| Conversation | Messaging |
| Message | Messaging |
| Message version | Messaging |
| Media file | Media & Storage |
| Notification | Notifications |
| AI execution / suggestion | IA |
| Provider credential / adapter | Integrations |
| Audit record | Audit & Compliance |

## Messaging integration

Messaging owns `Conversation`, `Message`, `MessageVersion`, reactions, and message-level references. It does not own media storage, notification delivery, AI provider credentials, or audit persistence.

Typical flow:

`MessageCreated -> Outbox -> EventBus -> Notifications / Search / Audit / IA`

AI responses are represented as normal Messaging messages. The IA domain may request or suggest a response but never directly mutates Messaging persistence.

Attachments use opaque `mediaFileId` references owned by Media & Storage.

## AI integration

The existing HopeHouse AI implementation must be consolidated with the provider-independent architecture rather than duplicated. Provider-specific calls belong behind the Integrations boundary. Prompt versions are immutable once published and executions record the prompt/model version used.

## Explicit exclusions

The following NexaForge-specific business concepts are not imported into HopeHouse:

- Manifest
- ManifestEvent
- ManifestStatus
- NexaForge-specific Prisma models
- NexaForge migrations
- NexaForge-specific monorepo/package layout

## Implementation guardrails

1. Do not change the production Prisma schema solely from this document.
2. Do not create a second event bus, audit system, AI runtime, or notification system.
3. Do not add Messaging tables until the Messaging bounded-context specification is consolidated with `13-MESSAGERIE.md` and the master architecture.
4. Keep existing authentication/security behavior backward compatible.
5. Add tests for each shared-kernel primitive before migrating existing domains to it.
6. Merge into `main` only after architecture review and the complete test suite passes.
