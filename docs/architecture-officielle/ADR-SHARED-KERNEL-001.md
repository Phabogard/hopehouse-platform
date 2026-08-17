# ADR — Consolidated HopeHouse Shared Kernel

## Status
Proposed

## Context

HopeHouse and NexaForge contain overlapping architectural ideas: domain events, correlation/causation metadata, append-only history, optimistic concurrency, idempotency, snapshots, auditability, and provider abstraction. Importing both implementations would create duplicate primitives and conflicting ownership.

## Decision

HopeHouse will own one shared architectural kernel. NexaForge contributes validated patterns and contracts, not business entities or persistence models.

The kernel standardizes event metadata, Outbox semantics, idempotency, optimistic concurrency, injectable time/ID services, domain errors/results, and cross-domain contract conventions.

Existing HopeHouse domain ownership remains authoritative. Existing Audit, Authentication/Security, Prisma, and AI modules are consolidated in place instead of duplicated.

## Consequences

Positive:

- one event envelope across domains;
- deterministic tracing with correlation and causation IDs;
- reliable event publication through Outbox;
- safer concurrent updates;
- no duplicate audit/AI/notification infrastructure;
- Messaging can integrate with IA, Notifications, Search, Media, Realtime, and Audit through contracts.

Trade-offs:

- migration must be incremental;
- existing modules require adapters before adopting new contracts;
- UUID v7 adoption requires compatibility analysis;
- event schemas require explicit versioning.

## Rejected alternatives

### Copy NexaForge into HopeHouse

Rejected because it duplicates business entities, Prisma models, migrations, and infrastructure.

### Keep two independent event systems

Rejected because cross-domain tracing and reliability would become inconsistent.

### Make Messaging own notifications, media, or AI provider state

Rejected because it violates single ownership and creates coupling.

## Required follow-up

- compare current HopeHouse core types with the target kernel;
- implement kernel primitives with tests;
- design the Outbox schema and transaction boundary;
- consolidate AI provider access behind Integrations;
- complete the detailed Messaging bounded-context specification;
- only then design Messaging Prisma models and migrations.
