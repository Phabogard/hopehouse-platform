import { randomUUID } from 'node:crypto';
import type { AuthCredentialRepository } from '../../modules/auth-security/repositories.js';
import type { AuthCredential } from '../../modules/auth-security/types.js';
import { parseDomainDate, parseNullableDomainDate, toDomainIso, toReadonlyJsonObject } from './mappers.js';

const PASSWORD_CREDENTIAL_TYPE = 'password';
const ACTIVE_STATUS = 'active';
const ROTATED_STATUS = 'rotated';

type PrismaAuthCredentialRecord = {
  readonly id: string;
  readonly userId: string;
  readonly credentialType: string;
  readonly credentialHash: string;
  readonly status: AuthCredential['status'];
  readonly lastChangedAt: Date | string;
  readonly mustRotateAt: Date | string | null;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
  readonly metadata: unknown;
};

type PrismaAuthCredentialCreateInput = {
  readonly id: string;
  readonly userId: string;
  readonly credentialType: string;
  readonly credentialHash: string;
  readonly status: 'active';
  readonly lastChangedAt: Date;
  readonly mustRotateAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly metadata: Readonly<Record<string, unknown>>;
};

type PrismaAuthCredentialUpdateInput = {
  readonly status: 'rotated';
  readonly lastChangedAt: Date;
  readonly updatedAt: Date;
};

type PrismaAuthCredentialWhereInput = {
  readonly userId: string;
  readonly credentialType: typeof PASSWORD_CREDENTIAL_TYPE;
  readonly status: AuthCredential['status'];
};

type PrismaAuthCredentialDelegate = {
  findFirst(input: {
    readonly where: PrismaAuthCredentialWhereInput;
    readonly orderBy: { readonly lastChangedAt: 'desc' };
  }): Promise<PrismaAuthCredentialRecord | null>;
  findMany(input: { readonly where: PrismaAuthCredentialWhereInput }): Promise<readonly PrismaAuthCredentialRecord[]>;
  updateMany(input: {
    readonly where: { readonly id: { readonly in: readonly string[] }; readonly status: 'active' };
    readonly data: PrismaAuthCredentialUpdateInput;
  }): Promise<{ readonly count: number }>;
  create(input: { readonly data: PrismaAuthCredentialCreateInput }): Promise<PrismaAuthCredentialRecord>;
};

type PrismaAuthCredentialTransactionClient = {
  readonly authCredential: PrismaAuthCredentialDelegate;
};

export interface PrismaAuthCredentialClient extends PrismaAuthCredentialTransactionClient {
  $transaction<T>(operation: (transaction: PrismaAuthCredentialTransactionClient) => Promise<T>): Promise<T>;
}

function nullableIso(value: Date | string | null): string | null {
  return value === null ? null : toDomainIso(value);
}

function toDomain(record: PrismaAuthCredentialRecord): AuthCredential {
  return Object.freeze({
    id: record.id,
    userId: record.userId,
    credentialType: record.credentialType,
    credentialHash: record.credentialHash,
    status: record.status,
    lastChangedAt: toDomainIso(record.lastChangedAt),
    mustRotateAt: nullableIso(record.mustRotateAt),
    metadata: toReadonlyJsonObject(record.metadata),
  });
}

function toCreateInput(input: { userId: string; credentialHash: string; changedAt: string; metadata?: Record<string, unknown> }): PrismaAuthCredentialCreateInput {
  const changedAt = parseDomainDate(input.changedAt, 'auth credential change');
  return {
    id: randomUUID(),
    userId: input.userId,
    credentialType: PASSWORD_CREDENTIAL_TYPE,
    credentialHash: input.credentialHash,
    status: ACTIVE_STATUS,
    lastChangedAt: changedAt,
    mustRotateAt: parseNullableDomainDate(null, 'auth credential rotation requirement'),
    createdAt: changedAt,
    updatedAt: changedAt,
    metadata: Object.freeze({ ...(input.metadata ?? {}) }),
  };
}

function toRotatedInput(changedAt: string): PrismaAuthCredentialUpdateInput {
  const rotatedAt = parseDomainDate(changedAt, 'auth credential rotation');
  return { status: ROTATED_STATUS, lastChangedAt: rotatedAt, updatedAt: rotatedAt };
}

export class PrismaAuthCredentialRepository implements AuthCredentialRepository {
  constructor(private readonly client: PrismaAuthCredentialClient) {}

  async findActivePasswordCredentialByUserId(userId: string): Promise<AuthCredential | null> {
    const credential = await this.client.authCredential.findFirst({
      where: { userId, credentialType: PASSWORD_CREDENTIAL_TYPE, status: ACTIVE_STATUS },
      orderBy: { lastChangedAt: 'desc' },
    });
    return credential === null ? null : toDomain(credential);
  }

  replacePasswordCredential(input: { userId: string; credentialHash: string; changedAt: string; metadata?: Record<string, unknown> }): Promise<AuthCredential> {
    return this.client.$transaction(async (transaction) => {
      const activeCredentials = await transaction.authCredential.findMany({
        where: { userId: input.userId, credentialType: PASSWORD_CREDENTIAL_TYPE, status: ACTIVE_STATUS },
      });
      const activeCredentialIds = activeCredentials.map((credential) => credential.id);
      if (activeCredentialIds.length > 0) {
        const rotation = await transaction.authCredential.updateMany({
          where: { id: { in: activeCredentialIds }, status: ACTIVE_STATUS },
          data: toRotatedInput(input.changedAt),
        });
        if (rotation.count !== activeCredentialIds.length) throw new Error('Concurrent password credential rotation detected');
      }
      const created = await transaction.authCredential.create({ data: toCreateInput(input) });
      return toDomain(created);
    });
  }
}
