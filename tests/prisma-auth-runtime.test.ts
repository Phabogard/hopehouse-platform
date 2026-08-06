import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaAuthRuntimeContext, type PrismaAuthRuntimeClient } from '../src/infrastructure/prisma/auth-runtime.js';
import { PrismaAuthCredentialRepository } from '../src/infrastructure/prisma/auth-credential-repository.js';
import { PrismaAuthUserRepository } from '../src/infrastructure/prisma/auth-user-repository.js';
import { PrismaDeviceFingerprintRepository } from '../src/infrastructure/prisma/device-fingerprint-repository.js';
import { PrismaLoginAttemptRepository } from '../src/infrastructure/prisma/login-attempt-repository.js';
import { PrismaPasswordResetRequestRepository } from '../src/infrastructure/prisma/password-reset-request-repository.js';
import { PrismaRefreshTokenRepository } from '../src/infrastructure/prisma/refresh-token-repository.js';
import { PrismaSecurityEventRepository } from '../src/infrastructure/prisma/security-event-repository.js';
import { PrismaSessionRepository } from '../src/infrastructure/prisma/session-repository.js';
import { PrismaTwoFactorChallengeRepository } from '../src/infrastructure/prisma/two-factor-challenge-repository.js';

function unsupported(): never {
  throw new Error('not used by runtime construction test');
}

function fakeClient(): PrismaAuthRuntimeClient {
  return {
    $connect: async () => undefined,
    $disconnect: async () => undefined,
    $transaction: async (operation: (transaction: unknown) => Promise<unknown>) => operation(fakeClient()),
    user: { findUnique: unsupported },
    authCredential: { findFirst: unsupported, findMany: unsupported, updateMany: unsupported, create: unsupported },
    deviceFingerprint: { upsert: unsupported, findUnique: unsupported, findMany: unsupported },
    loginAttempt: { create: unsupported, count: unsupported },
    passwordResetRequest: { upsert: unsupported, findUnique: unsupported },
    sessionRefreshToken: { upsert: unsupported, findUnique: unsupported, update: unsupported, updateMany: unsupported, create: unsupported },
    securityEvent: { create: unsupported, findMany: unsupported },
    loginSession: { upsert: unsupported, findUnique: unsupported, findMany: unsupported },
    twoFactorChallenge: { upsert: unsupported, findUnique: unsupported },
  } as unknown as PrismaAuthRuntimeClient;
}

test('PrismaAuthRuntimeContext wires all Prisma repositories without touching the in-memory runtime', () => {
  const runtime = new PrismaAuthRuntimeContext(fakeClient(), { jwtSecret: 'test-secret' });

  assert.equal(runtime.userRepository instanceof PrismaAuthUserRepository, true);
  assert.equal(runtime.credentialRepository instanceof PrismaAuthCredentialRepository, true);
  assert.equal(runtime.loginAttemptRepository instanceof PrismaLoginAttemptRepository, true);
  assert.equal(runtime.deviceFingerprintRepository instanceof PrismaDeviceFingerprintRepository, true);
  assert.equal(runtime.sessionRepository instanceof PrismaSessionRepository, true);
  assert.equal(runtime.refreshTokenRepository instanceof PrismaRefreshTokenRepository, true);
  assert.equal(runtime.passwordResetRequestRepository instanceof PrismaPasswordResetRequestRepository, true);
  assert.equal(runtime.twoFactorChallengeRepository instanceof PrismaTwoFactorChallengeRepository, true);
  assert.equal(runtime.securityEventRepository instanceof PrismaSecurityEventRepository, true);
  assert.equal(typeof runtime.login, 'function');
  assert.equal(typeof runtime.authenticateAccessToken, 'function');
});

test('PrismaAuthRuntimeContext.create builds the Prisma client through createPrismaClient options', async () => {
  const createdWith: unknown[] = [];
  class FakePrismaClient {
    constructor(options?: unknown) { createdWith.push(options); }
    async $connect(): Promise<void> { return undefined; }
    async $disconnect(): Promise<void> { return undefined; }
  }

  const runtime = await PrismaAuthRuntimeContext.create({
    jwtSecret: 'test-secret',
    databaseUrl: 'postgresql://example.test/hopehouse',
    prisma: { loadModule: async () => ({ PrismaClient: FakePrismaClient as never }) },
  });

  assert.equal(runtime instanceof PrismaAuthRuntimeContext, true);
  assert.equal(JSON.stringify(createdWith), JSON.stringify([{ datasources: { db: { url: 'postgresql://example.test/hopehouse' } } }]));
});
