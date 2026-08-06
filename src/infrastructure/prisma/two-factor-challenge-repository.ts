import type { TwoFactorChallengeRepository } from '../../modules/auth-security/repositories.js';
import type { TwoFactorChallenge } from '../../modules/auth-security/types.js';
import { parseDomainDate, parseNullableDomainDate, toDomainIso, toReadonlyJsonObject } from './mappers.js';

const LOGIN_ACTION = 'auth.login';

type PrismaTwoFactorChallengeRecord = {
  readonly id: string;
  readonly userId: string;
  readonly sessionId: string | null;
  readonly action: string;
  readonly method: string;
  readonly challengeHash: string | null;
  readonly status: TwoFactorChallenge['status'];
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly expiresAt: Date | string;
  readonly verifiedAt: Date | string | null;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
  readonly metadata: unknown;
};

type PrismaTwoFactorChallengeSaveInput = {
  readonly id: string;
  readonly userId: string;
  readonly sessionId: string | null;
  readonly action: string;
  readonly method: string;
  readonly challengeHash: string;
  readonly status: TwoFactorChallenge['status'];
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly expiresAt: Date;
  readonly verifiedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly metadata: Readonly<Record<string, unknown>>;
};

type PrismaTwoFactorChallengeDelegate = {
  upsert(input: {
    readonly where: { readonly id: string };
    readonly create: PrismaTwoFactorChallengeSaveInput;
    readonly update: PrismaTwoFactorChallengeSaveInput;
  }): Promise<PrismaTwoFactorChallengeRecord>;
  findUnique(input: { readonly where: { readonly id: string } }): Promise<PrismaTwoFactorChallengeRecord | null>;
};

export interface PrismaTwoFactorChallengeClient {
  readonly twoFactorChallenge: PrismaTwoFactorChallengeDelegate;
}

function toCreateInput(challenge: TwoFactorChallenge): PrismaTwoFactorChallengeSaveInput {
  const createdAt = parseDomainDate(challenge.createdAt, 'two-factor challenge creation');
  return toSaveInput(challenge, createdAt);
}

function toUpdateInput(challenge: TwoFactorChallenge): PrismaTwoFactorChallengeSaveInput {
  return toSaveInput(challenge, new Date());
}

function toSaveInput(challenge: TwoFactorChallenge, updatedAt: Date): PrismaTwoFactorChallengeSaveInput {
  return {
    id: challenge.id,
    userId: challenge.userId,
    sessionId: null,
    action: LOGIN_ACTION,
    method: challenge.method,
    challengeHash: challenge.codeHash,
    status: challenge.status,
    attemptCount: challenge.attempts,
    maxAttempts: challenge.maxAttempts,
    expiresAt: parseDomainDate(challenge.expiresAt, 'two-factor challenge expiration'),
    verifiedAt: parseNullableDomainDate(challenge.verifiedAt, 'two-factor challenge verification'),
    createdAt: parseDomainDate(challenge.createdAt, 'two-factor challenge creation'),
    updatedAt,
    metadata: challenge.metadata,
  };
}

function nullableIso(value: Date | string | null): string | null {
  return value === null ? null : toDomainIso(value);
}

function toDomain(record: PrismaTwoFactorChallengeRecord): TwoFactorChallenge {
  return Object.freeze({
    id: record.id,
    userId: record.userId,
    method: record.method,
    codeHash: record.challengeHash ?? '',
    status: record.status,
    attempts: record.attemptCount,
    maxAttempts: record.maxAttempts,
    expiresAt: toDomainIso(record.expiresAt),
    verifiedAt: nullableIso(record.verifiedAt),
    createdAt: toDomainIso(record.createdAt),
    metadata: toReadonlyJsonObject(record.metadata),
  });
}

export class PrismaTwoFactorChallengeRepository implements TwoFactorChallengeRepository {
  constructor(private readonly client: PrismaTwoFactorChallengeClient) {}

  async save(challenge: TwoFactorChallenge): Promise<TwoFactorChallenge> {
    const saved = await this.client.twoFactorChallenge.upsert({
      where: { id: challenge.id },
      create: toCreateInput(challenge),
      update: toUpdateInput(challenge),
    });
    return toDomain(saved);
  }

  async findById(challengeId: string): Promise<TwoFactorChallenge | null> {
    const challenge = await this.client.twoFactorChallenge.findUnique({ where: { id: challengeId } });
    return challenge === null ? null : toDomain(challenge);
  }
}
