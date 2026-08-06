import type { RefreshTokenRepository } from '../../modules/auth-security/repositories.js';
import type { SessionRefreshToken } from '../../modules/auth-security/types.js';
import { parseDomainDate, parseNullableDomainDate, toDomainIso, toReadonlyJsonObject } from './mappers.js';

type PrismaSessionRefreshTokenRecord = {
  readonly id: string;
  readonly sessionId: string;
  readonly tokenHash: string;
  readonly status: SessionRefreshToken['status'];
  readonly issuedAt: Date | string;
  readonly expiresAt: Date | string;
  readonly rotatedAt: Date | string | null;
  readonly revokedAt: Date | string | null;
  readonly replacedByTokenId: string | null;
  readonly metadata: unknown;
};

type PrismaSessionRefreshTokenSaveInput = {
  readonly id: string;
  readonly sessionId: string;
  readonly tokenHash: string;
  readonly status: SessionRefreshToken['status'];
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly rotatedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly replacedByTokenId: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
};

type PrismaSessionRefreshTokenUpdateInput = Omit<PrismaSessionRefreshTokenSaveInput, 'id'>;

type PrismaSessionRefreshTokenDelegate = {
  upsert(input: {
    readonly where: { readonly id: string };
    readonly create: PrismaSessionRefreshTokenSaveInput;
    readonly update: PrismaSessionRefreshTokenUpdateInput;
  }): Promise<PrismaSessionRefreshTokenRecord>;
  findUnique(input: { readonly where: { readonly tokenHash: string } | { readonly id: string } }): Promise<PrismaSessionRefreshTokenRecord | null>;
  update(input: {
    readonly where: { readonly id: string };
    readonly data: Partial<PrismaSessionRefreshTokenUpdateInput>;
  }): Promise<PrismaSessionRefreshTokenRecord>;
  updateMany(input: {
    readonly where: { readonly id: string; readonly status: 'active' };
    readonly data: { readonly status: 'rotated'; readonly rotatedAt: Date; readonly replacedByTokenId: string };
  }): Promise<{ readonly count: number }>;
  create(input: { readonly data: PrismaSessionRefreshTokenSaveInput }): Promise<PrismaSessionRefreshTokenRecord>;
};

type PrismaRefreshTokenTransactionClient = {
  readonly sessionRefreshToken: PrismaSessionRefreshTokenDelegate;
};

export interface PrismaRefreshTokenClient extends PrismaRefreshTokenTransactionClient {
  $transaction<T>(operation: (transaction: PrismaRefreshTokenTransactionClient) => Promise<T>): Promise<T>;
}

function toSaveInput(token: SessionRefreshToken): PrismaSessionRefreshTokenSaveInput {
  return {
    id: token.id,
    sessionId: token.sessionId,
    tokenHash: token.tokenHash,
    status: token.status,
    issuedAt: parseDomainDate(token.issuedAt, 'refresh token issue'),
    expiresAt: parseDomainDate(token.expiresAt, 'refresh token expiration'),
    rotatedAt: parseNullableDomainDate(token.rotatedAt, 'refresh token rotation'),
    revokedAt: parseNullableDomainDate(token.revokedAt, 'refresh token revocation'),
    replacedByTokenId: token.replacedByTokenId,
    metadata: token.metadata,
  };
}

function toUpdateInput(token: SessionRefreshToken): PrismaSessionRefreshTokenUpdateInput {
  const { id: _id, ...data } = toSaveInput(token);
  return data;
}

function nullableIso(value: Date | string | null): string | null {
  return value === null ? null : toDomainIso(value);
}

function toDomain(record: PrismaSessionRefreshTokenRecord): SessionRefreshToken {
  return Object.freeze({
    id: record.id,
    sessionId: record.sessionId,
    tokenHash: record.tokenHash,
    status: record.status,
    issuedAt: toDomainIso(record.issuedAt),
    expiresAt: toDomainIso(record.expiresAt),
    rotatedAt: nullableIso(record.rotatedAt),
    revokedAt: nullableIso(record.revokedAt),
    replacedByTokenId: record.replacedByTokenId,
    metadata: toReadonlyJsonObject(record.metadata),
  });
}

export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly client: PrismaRefreshTokenClient) {}

  async save(token: SessionRefreshToken): Promise<SessionRefreshToken> {
    const saved = await this.client.sessionRefreshToken.upsert({ where: { id: token.id }, create: toSaveInput(token), update: toUpdateInput(token) });
    return toDomain(saved);
  }

  async findByHash(tokenHash: string): Promise<SessionRefreshToken | null> {
    const token = await this.client.sessionRefreshToken.findUnique({ where: { tokenHash } });
    return token === null ? null : toDomain(token);
  }

  rotateActive(input: { tokenHash: string; rotatedAt: string; nextToken: SessionRefreshToken }): Promise<{ previous: SessionRefreshToken; next: SessionRefreshToken } | null> {
    return this.client.$transaction(async (transaction) => {
      const existing = await transaction.sessionRefreshToken.findUnique({ where: { tokenHash: input.tokenHash } });
      if (existing === null || existing.status !== 'active') return null;
      const rotatedAt = parseDomainDate(input.rotatedAt, 'refresh token rotation');
      const update = await transaction.sessionRefreshToken.updateMany({
        where: { id: existing.id, status: 'active' },
        data: { status: 'rotated', rotatedAt, replacedByTokenId: input.nextToken.id },
      });
      if (update.count !== 1) return null;
      const next = await transaction.sessionRefreshToken.create({ data: toSaveInput(input.nextToken) });
      return {
        previous: toDomain({ ...existing, status: 'rotated', rotatedAt, replacedByTokenId: input.nextToken.id }),
        next: toDomain(next),
      };
    });
  }

  async markReused(input: { tokenHash: string; reusedAt: string }): Promise<SessionRefreshToken | null> {
    const existing = await this.client.sessionRefreshToken.findUnique({ where: { tokenHash: input.tokenHash } });
    if (existing === null) return null;
    const reused = await this.client.sessionRefreshToken.update({
      where: { id: existing.id },
      data: { status: 'reused', revokedAt: parseDomainDate(input.reusedAt, 'refresh token reuse') },
    });
    return toDomain(reused);
  }
}
