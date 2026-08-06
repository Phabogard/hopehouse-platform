import type { PasswordResetRequestRepository } from '../../modules/auth-security/repositories.js';
import type { PasswordResetRequestRecord } from '../../modules/auth-security/types.js';
import { parseDomainDate, parseNullableDomainDate, toDomainIso, toReadonlyJsonObject } from './mappers.js';

type PrismaPasswordResetRequestRecord = {
  readonly id: string;
  readonly userId: string | null;
  readonly identifierHash: string;
  readonly tokenHash: string;
  readonly status: PasswordResetRequestRecord['status'];
  readonly expiresAt: Date | string;
  readonly completedAt: Date | string | null;
  readonly createdAt: Date | string;
  readonly metadata: unknown;
};

type PrismaPasswordResetRequestSaveInput = {
  readonly id: string;
  readonly userId: string | null;
  readonly identifierHash: string;
  readonly tokenHash: string;
  readonly status: PasswordResetRequestRecord['status'];
  readonly expiresAt: Date;
  readonly completedAt: Date | null;
  readonly createdAt: Date;
  readonly metadata: Readonly<Record<string, unknown>>;
};

type PrismaPasswordResetRequestDelegate = {
  upsert(input: {
    readonly where: { readonly id: string };
    readonly create: PrismaPasswordResetRequestSaveInput;
    readonly update: PrismaPasswordResetRequestSaveInput;
  }): Promise<PrismaPasswordResetRequestRecord>;
  findUnique(input: { readonly where: { readonly tokenHash: string } }): Promise<PrismaPasswordResetRequestRecord | null>;
};

export interface PrismaPasswordResetRequestClient {
  readonly passwordResetRequest: PrismaPasswordResetRequestDelegate;
}

function toSaveInput(request: PasswordResetRequestRecord): PrismaPasswordResetRequestSaveInput {
  return {
    id: request.id,
    userId: request.userId,
    identifierHash: request.identifierHash,
    tokenHash: request.tokenHash,
    status: request.status,
    expiresAt: parseDomainDate(request.expiresAt, 'password reset request expiration'),
    completedAt: parseNullableDomainDate(request.completedAt, 'password reset request completion'),
    createdAt: parseDomainDate(request.createdAt, 'password reset request creation'),
    metadata: request.metadata,
  };
}

function nullableIso(value: Date | string | null): string | null {
  return value === null ? null : toDomainIso(value);
}

function toDomain(record: PrismaPasswordResetRequestRecord): PasswordResetRequestRecord {
  return Object.freeze({
    id: record.id,
    userId: record.userId,
    identifierHash: record.identifierHash,
    tokenHash: record.tokenHash,
    status: record.status,
    expiresAt: toDomainIso(record.expiresAt),
    completedAt: nullableIso(record.completedAt),
    createdAt: toDomainIso(record.createdAt),
    metadata: toReadonlyJsonObject(record.metadata),
  });
}

export class PrismaPasswordResetRequestRepository implements PasswordResetRequestRepository {
  constructor(private readonly client: PrismaPasswordResetRequestClient) {}

  async save(request: PasswordResetRequestRecord): Promise<PasswordResetRequestRecord> {
    const data = toSaveInput(request);
    const saved = await this.client.passwordResetRequest.upsert({ where: { id: request.id }, create: data, update: data });
    return toDomain(saved);
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetRequestRecord | null> {
    const request = await this.client.passwordResetRequest.findUnique({ where: { tokenHash } });
    return request === null ? null : toDomain(request);
  }
}
