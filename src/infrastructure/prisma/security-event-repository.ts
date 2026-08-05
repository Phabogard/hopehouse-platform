import type { SecurityEventRepository } from '../../modules/auth-security/repositories.js';
import type { SecurityEvent } from '../../modules/auth-security/types.js';
import { parseDomainDate, toDomainIso, toReadonlyJsonObject } from './mappers.js';

type PrismaSecurityEventRecord = {
  readonly id: string;
  readonly userId: string | null;
  readonly actorUserId: string | null;
  readonly eventType: string;
  readonly severity: SecurityEvent['severity'];
  readonly relatedEntityType: string | null;
  readonly relatedEntityId: string | null;
  readonly occurredAt: Date | string;
  readonly metadata: unknown;
};

type PrismaSecurityEventCreateInput = {
  readonly id: string;
  readonly userId: string | null;
  readonly actorUserId: string | null;
  readonly eventType: string;
  readonly severity: SecurityEvent['severity'];
  readonly relatedEntityType: string | null;
  readonly relatedEntityId: string | null;
  readonly occurredAt: Date;
  readonly metadata: Readonly<Record<string, unknown>>;
};

type PrismaSecurityEventDelegate = {
  create(input: { readonly data: PrismaSecurityEventCreateInput }): Promise<PrismaSecurityEventRecord>;
  findMany(input: {
    readonly where: Record<string, unknown>;
    readonly orderBy: { readonly occurredAt: 'asc' };
  }): Promise<readonly PrismaSecurityEventRecord[]>;
};

export interface PrismaSecurityEventClient {
  readonly securityEvent: PrismaSecurityEventDelegate;
}

function toDomain(record: PrismaSecurityEventRecord): SecurityEvent {
  return Object.freeze({
    id: record.id,
    userId: record.userId,
    actorUserId: record.actorUserId,
    eventType: record.eventType,
    severity: record.severity,
    relatedEntityType: record.relatedEntityType,
    relatedEntityId: record.relatedEntityId,
    occurredAt: toDomainIso(record.occurredAt),
    metadata: toReadonlyJsonObject(record.metadata),
  });
}

export class PrismaSecurityEventRepository implements SecurityEventRepository {
  constructor(private readonly client: PrismaSecurityEventClient) {}

  async record(event: SecurityEvent): Promise<SecurityEvent> {
    const saved = await this.client.securityEvent.create({
      data: {
        id: event.id,
        userId: event.userId,
        actorUserId: event.actorUserId,
        eventType: event.eventType,
        severity: event.severity,
        relatedEntityType: event.relatedEntityType,
        relatedEntityId: event.relatedEntityId,
        occurredAt: parseDomainDate(event.occurredAt, 'security event occurrence'),
        metadata: event.metadata,
      },
    });
    return toDomain(saved);
  }

  async listByUserId(userId: string): Promise<readonly SecurityEvent[]> {
    return this.listWhere({ userId });
  }

  async listByActorUserId(actorUserId: string): Promise<readonly SecurityEvent[]> {
    return this.listWhere({ actorUserId });
  }

  private async listWhere(where: Record<string, unknown>): Promise<readonly SecurityEvent[]> {
    const records = await this.client.securityEvent.findMany({ where, orderBy: { occurredAt: 'asc' } });
    return Object.freeze(records.map(toDomain));
  }
}
