import type { Prisma, PrismaClient } from '@prisma/client';
import { deepFreeze, type AuditLogRepository, type AuditLogRecordInput, type AuditLogQueryFilters } from '../../modules/audit/audit-log.js';
import type { AuditLog, AuditOutcome } from '../../core/types.js';
import { parseDomainDate, toDomainIso, toReadonlyJsonObject } from './mappers.js';

type PrismaAuditLogRecord = {
  readonly id: string;
  readonly actorUserId: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly outcome: string;
  readonly occurredAt: Date | string;
  readonly metadata: unknown;
};

export interface PrismaAuditLogWhereInput {
  actorUserId?: string | null;
  entityType?: string;
  entityId?: string;
  action?: string;
  outcome?: string;
}

export interface PrismaAuditLogDelegate {
  create(input: any): Promise<PrismaAuditLogRecord>;
  findMany(input?: any): Promise<readonly PrismaAuditLogRecord[]>;
}

export interface PrismaAuditLogClient {
  readonly auditLog: PrismaAuditLogDelegate;
}

function toDomain(record: PrismaAuditLogRecord): AuditLog {
  return deepFreeze({
    id: record.id,
    actorUserId: record.actorUserId,
    action: record.action,
    entityType: record.entityType,
    entityId: record.entityId,
    outcome: record.outcome as AuditOutcome,
    occurredAt: toDomainIso(record.occurredAt),
    metadata: deepFreeze(toReadonlyJsonObject(record.metadata)),
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
        metadata: deepFreeze({ ...(input.metadata ?? {}) }) as Prisma.InputJsonValue,
      },
    });
    return toDomain(created);
  }

  async list(filters?: AuditLogQueryFilters): Promise<readonly AuditLog[]> {
    const where: PrismaAuditLogWhereInput = {};
    if (filters?.actorUserId !== undefined) where.actorUserId = filters.actorUserId;
    if (filters?.entityType !== undefined) where.entityType = filters.entityType;
    if (filters?.entityId !== undefined) where.entityId = filters.entityId;
    if (filters?.action !== undefined) where.action = filters.action;
    if (filters?.outcome !== undefined) where.outcome = filters.outcome;

    const records = await this.client.auditLog.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: filters?.limit,
    });
    return Object.freeze(records.map(toDomain));
  }
}

export { PrismaAuditLogRepository as PostgresAuditLogRepository };
