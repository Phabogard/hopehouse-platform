import type { AuditLogRepository, AuditLogRecordInput } from '../../modules/audit/audit-log.js';
import type { AuditLog } from '../../core/types.js';
import { parseDomainDate, toDomainIso, toReadonlyJsonObject } from './mappers.js';

type PrismaAuditLogRecord = {
  readonly id: string;
  readonly actorUserId: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly outcome: AuditLog['outcome'];
  readonly occurredAt: Date | string;
  readonly metadata: unknown;
};

type PrismaAuditLogCreateInput = {
  readonly id: string;
  readonly actorUserId: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly outcome: AuditLog['outcome'];
  readonly occurredAt: Date;
  readonly metadata: Readonly<Record<string, unknown>>;
};

export interface PrismaAuditLogDelegate {
  create(input: { readonly data: PrismaAuditLogCreateInput }): Promise<PrismaAuditLogRecord>;
  findMany(input: { readonly orderBy: { readonly occurredAt: 'desc' } }): Promise<readonly PrismaAuditLogRecord[]>;
}

export interface PrismaAuditLogClient {
  readonly auditLog: PrismaAuditLogDelegate;
}

function toDomain(record: PrismaAuditLogRecord): AuditLog {
  return Object.freeze({
    id: record.id,
    actorUserId: record.actorUserId,
    action: record.action,
    entityType: record.entityType,
    entityId: record.entityId,
    outcome: record.outcome,
    occurredAt: toDomainIso(record.occurredAt),
    metadata: toReadonlyJsonObject(record.metadata),
  });
}

export class PrismaAuditLogRepository implements AuditLogRepository {
  constructor(private readonly client: PrismaAuditLogClient) {}

  async record(input: AuditLogRecordInput): Promise<AuditLog> {
    const occurredAt = parseDomainDate(input.occurredAt, 'audit log occurrence');
    const created = await this.client.auditLog.create({
      data: {
        id: input.id,
        actorUserId: input.actorUserId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        outcome: input.outcome,
        occurredAt,
        metadata: Object.freeze({ ...(input.metadata ?? {}) }),
      },
    });
    return toDomain(created);
  }

  async list(): Promise<readonly AuditLog[]> {
    const records = await this.client.auditLog.findMany({ orderBy: { occurredAt: 'desc' } });
    return Object.freeze(records.map(toDomain));
  }
}
