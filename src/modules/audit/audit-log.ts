import { randomUUID } from 'node:crypto';
import { type AuditLog, type AuditOutcome } from '../../core/types.js';

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

export interface AuditLogRepository {
  record(input: AuditLogRecordInput): Promise<AuditLog>;
  list(): Promise<readonly AuditLog[]>;
}

export class InMemoryAuditLogRepository implements AuditLogRepository {
  private readonly entries: AuditLog[] = [];

  async record(input: AuditLogRecordInput): Promise<AuditLog> {
    const entry: AuditLog = Object.freeze({
      id: input.id,
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      outcome: input.outcome,
      occurredAt: input.occurredAt,
      metadata: Object.freeze({ ...(input.metadata ?? {}) }),
    });
    this.entries.push(entry);
    return entry;
  }

  async list(): Promise<readonly AuditLog[]> {
    return Object.freeze([...this.entries]);
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

  list(): Promise<readonly AuditLog[]> {
    return this.repository.list();
  }
}
