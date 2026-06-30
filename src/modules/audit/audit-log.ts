import { randomUUID } from 'node:crypto';
import { type AuditLog, type AuditOutcome } from '../../core/types.js';

export class AuditLogService {
  private readonly entries: AuditLog[] = [];

  record(input: {
    actorUserId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    outcome: AuditOutcome;
    metadata?: Record<string, unknown>;
  }): AuditLog {
    const entry: AuditLog = {
      id: randomUUID(),
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      outcome: input.outcome,
      occurredAt: new Date().toISOString(),
      metadata: input.metadata ?? {},
    };
    this.entries.push(entry);
    return entry;
  }

  list(): readonly AuditLog[] {
    return this.entries;
  }
}
