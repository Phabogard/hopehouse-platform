import { randomUUID } from 'node:crypto';
import { type AuditLog, type AuditOutcome } from '../../core/types.js';

export function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const prop of Object.getOwnPropertyNames(obj)) {
    const val = (obj as Record<string, unknown>)[prop];
    if (val !== null && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

export interface AuditLogRecordInput {
  readonly id: string;
  readonly actorUserId: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly outcome: AuditOutcome;
  readonly occurredAt: string;
  readonly metadata?: Record<string, unknown>;
}

export interface AuditLogQueryFilters {
  readonly actorUserId?: string | null;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly action?: string;
  readonly outcome?: AuditOutcome;
  readonly limit?: number;
}

export interface AuditLogRepository {
  record(input: AuditLogRecordInput): Promise<AuditLog>;
  list(filters?: AuditLogQueryFilters): Promise<readonly AuditLog[]>;
}

export class InMemoryAuditLogRepository implements AuditLogRepository {
  private readonly entries: AuditLog[] = [];

  async record(input: AuditLogRecordInput): Promise<AuditLog> {
    const entry: AuditLog = deepFreeze({
      id: input.id,
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      outcome: input.outcome,
      occurredAt: input.occurredAt,
      metadata: deepFreeze({ ...(input.metadata ?? {}) }),
    });
    this.entries.push(entry);
    return entry;
  }

  async list(filters?: AuditLogQueryFilters): Promise<readonly AuditLog[]> {
    let results = [...this.entries];
    if (filters) {
      if (filters.actorUserId !== undefined) {
        results = results.filter((e) => e.actorUserId === filters.actorUserId);
      }
      if (filters.entityType !== undefined) {
        results = results.filter((e) => e.entityType === filters.entityType);
      }
      if (filters.entityId !== undefined) {
        results = results.filter((e) => e.entityId === filters.entityId);
      }
      if (filters.action !== undefined) {
        results = results.filter((e) => e.action === filters.action);
      }
      if (filters.outcome !== undefined) {
        results = results.filter((e) => e.outcome === filters.outcome);
      }
    }
    results.sort((a, b) => {
      if (a.occurredAt !== b.occurredAt) {
        return b.occurredAt.localeCompare(a.occurredAt);
      }
      return b.id.localeCompare(a.id);
    });
    if (filters?.limit !== undefined && filters.limit > 0) {
      results = results.slice(0, filters.limit);
    }
    return Object.freeze(results);
  }
}

export class AuditLogService {
  constructor(private readonly repository: AuditLogRepository = new InMemoryAuditLogRepository()) {}

  record(input: {
    actorUserId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    outcome: AuditOutcome;
    metadata?: Record<string, unknown>;
  }): Promise<AuditLog> {
    return this.repository.record({
      id: randomUUID(),
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      outcome: input.outcome,
      occurredAt: new Date().toISOString(),
      metadata: input.metadata,
    });
  }

  list(filters?: AuditLogQueryFilters): Promise<readonly AuditLog[]> {
    return this.repository.list(filters);
  }

  getRepository(): AuditLogRepository {
    return this.repository;
  }
}
