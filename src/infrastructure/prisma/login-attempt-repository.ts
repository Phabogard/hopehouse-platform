import type { LoginAttemptRepository } from '../../modules/auth-security/repositories.js';
import type { LoginAttempt } from '../../modules/auth-security/types.js';
import { parseDomainDate, toDomainIso, toReadonlyJsonObject } from './mappers.js';

type PrismaLoginAttemptRecord = {
  readonly id: string;
  readonly userId: string | null;
  readonly identifierHash: string;
  readonly deviceFingerprintId: string | null;
  readonly ipAddressHash: string | null;
  readonly outcome: LoginAttempt['outcome'];
  readonly failureReason: string | null;
  readonly occurredAt: Date | string;
  readonly metadata: unknown;
};

type PrismaLoginAttemptCreateInput = {
  readonly id: string;
  readonly userId: string | null;
  readonly identifierHash: string;
  readonly deviceFingerprintId: string | null;
  readonly ipAddressHash: string | null;
  readonly outcome: LoginAttempt['outcome'];
  readonly failureReason: string | null;
  readonly occurredAt: Date;
  readonly metadata: Readonly<Record<string, unknown>>;
};

type PrismaLoginAttemptDelegate = {
  create(input: { readonly data: PrismaLoginAttemptCreateInput }): Promise<PrismaLoginAttemptRecord>;
  count(input: {
    readonly where: {
      readonly identifierHash: string;
      readonly outcome: 'failed';
      readonly occurredAt: {
        readonly gte: Date;
        readonly lte: Date;
      };
    };
  }): Promise<number>;
};

export interface PrismaLoginAttemptClient {
  readonly loginAttempt: PrismaLoginAttemptDelegate;
}

function toDomain(record: PrismaLoginAttemptRecord): LoginAttempt {
  return Object.freeze({
    id: record.id,
    userId: record.userId,
    identifierHash: record.identifierHash,
    deviceFingerprintId: record.deviceFingerprintId,
    ipAddressHash: record.ipAddressHash,
    outcome: record.outcome,
    failureReason: record.failureReason,
    occurredAt: toDomainIso(record.occurredAt),
    metadata: toReadonlyJsonObject(record.metadata),
  });
}

export class PrismaLoginAttemptRepository implements LoginAttemptRepository {
  constructor(private readonly client: PrismaLoginAttemptClient) {}

  async record(attempt: LoginAttempt): Promise<LoginAttempt> {
    const saved = await this.client.loginAttempt.create({
      data: {
        id: attempt.id,
        userId: attempt.userId,
        identifierHash: attempt.identifierHash,
        deviceFingerprintId: attempt.deviceFingerprintId,
        ipAddressHash: attempt.ipAddressHash,
        outcome: attempt.outcome,
        failureReason: attempt.failureReason,
        occurredAt: parseDomainDate(attempt.occurredAt, 'login attempt occurrence'),
        metadata: attempt.metadata,
      },
    });
    return toDomain(saved);
  }

  countRecentFailures(input: { identifierHash: string; since: string; now: string }): Promise<number> {
    return this.client.loginAttempt.count({
      where: {
        identifierHash: input.identifierHash,
        outcome: 'failed',
        occurredAt: {
          gte: parseDomainDate(input.since, 'login attempt lower bound'),
          lte: parseDomainDate(input.now, 'login attempt upper bound'),
        },
      },
    });
  }
}
