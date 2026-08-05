import type { SessionRepository } from '../../modules/auth-security/repositories.js';
import type { LoginSession } from '../../modules/auth-security/types.js';
import { parseDomainDate, parseNullableDomainDate, toDomainIso, toReadonlyJsonObject } from './mappers.js';

type PrismaLoginSessionRecord = {
  readonly id: string;
  readonly userId: string;
  readonly deviceFingerprintId: string | null;
  readonly status: LoginSession['status'];
  readonly issuedAt: Date | string;
  readonly expiresAt: Date | string;
  readonly idleExpiresAt: Date | string | null;
  readonly lastSeenAt: Date | string | null;
  readonly revokedAt: Date | string | null;
  readonly revokedByUserId: string | null;
  readonly revocationReason: string | null;
  readonly metadata: unknown;
};

type PrismaLoginSessionSaveInput = {
  readonly id: string;
  readonly userId: string;
  readonly deviceFingerprintId: string | null;
  readonly status: LoginSession['status'];
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly idleExpiresAt: Date | null;
  readonly lastSeenAt: Date | null;
  readonly revokedAt: Date | null;
  readonly revokedByUserId: string | null;
  readonly revocationReason: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
};

type PrismaLoginSessionDelegate = {
  upsert(input: {
    readonly where: { readonly id: string };
    readonly create: PrismaLoginSessionSaveInput;
    readonly update: PrismaLoginSessionSaveInput;
  }): Promise<PrismaLoginSessionRecord>;
  findUnique(input: { readonly where: { readonly id: string } }): Promise<PrismaLoginSessionRecord | null>;
  findMany(input: {
    readonly where: Record<string, unknown>;
    readonly orderBy: { readonly issuedAt: 'asc' };
  }): Promise<readonly PrismaLoginSessionRecord[]>;
};

export interface PrismaSessionClient {
  readonly loginSession: PrismaLoginSessionDelegate;
}

function toSaveInput(session: LoginSession): PrismaLoginSessionSaveInput {
  return {
    id: session.id,
    userId: session.userId,
    deviceFingerprintId: session.deviceFingerprintId,
    status: session.status,
    issuedAt: parseDomainDate(session.issuedAt, 'session issue'),
    expiresAt: parseDomainDate(session.expiresAt, 'session expiration'),
    idleExpiresAt: parseNullableDomainDate(session.idleExpiresAt, 'session idle expiration'),
    lastSeenAt: parseNullableDomainDate(session.lastSeenAt, 'session last seen'),
    revokedAt: parseNullableDomainDate(session.revokedAt, 'session revocation'),
    revokedByUserId: session.revokedByUserId,
    revocationReason: session.revocationReason,
    metadata: session.metadata,
  };
}

function nullableIso(value: Date | string | null): string | null {
  return value === null ? null : toDomainIso(value);
}

function toDomain(record: PrismaLoginSessionRecord): LoginSession {
  return Object.freeze({
    id: record.id,
    userId: record.userId,
    deviceFingerprintId: record.deviceFingerprintId,
    status: record.status,
    issuedAt: toDomainIso(record.issuedAt),
    expiresAt: toDomainIso(record.expiresAt),
    idleExpiresAt: nullableIso(record.idleExpiresAt),
    lastSeenAt: nullableIso(record.lastSeenAt),
    revokedAt: nullableIso(record.revokedAt),
    revokedByUserId: record.revokedByUserId,
    revocationReason: record.revocationReason,
    metadata: toReadonlyJsonObject(record.metadata),
  });
}

export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly client: PrismaSessionClient) {}

  async save(session: LoginSession): Promise<LoginSession> {
    const data = toSaveInput(session);
    const saved = await this.client.loginSession.upsert({ where: { id: session.id }, create: data, update: data });
    return toDomain(saved);
  }

  async findById(sessionId: string): Promise<LoginSession | null> {
    const session = await this.client.loginSession.findUnique({ where: { id: sessionId } });
    return session === null ? null : toDomain(session);
  }

  listActiveByUserId(userId: string): Promise<readonly LoginSession[]> {
    return this.listWhere({ userId, status: 'active' });
  }

  listActiveByDeviceId(deviceFingerprintId: string): Promise<readonly LoginSession[]> {
    return this.listWhere({ deviceFingerprintId, status: 'active' });
  }

  private async listWhere(where: Record<string, unknown>): Promise<readonly LoginSession[]> {
    const sessions = await this.client.loginSession.findMany({ where, orderBy: { issuedAt: 'asc' } });
    return Object.freeze(sessions.map(toDomain));
  }
}
