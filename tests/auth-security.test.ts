import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenError } from '../src/core/errors.js';
import {
  AuthService,
  DeviceFingerprintService,
  PasswordResetService,
  RefreshTokenService,
  SecurityEventService,
  SessionService,
  TwoFactorService,
  type AuthCredential,
  type AuthSecurityPolicy,
  type AuthenticatedUser,
  type Clock,
  type DeviceFingerprint,
  type LoginAttempt,
  type LoginSession,
  type PasswordResetRequestRecord,
  type RefreshTokenRepository,
  type SecretGenerator,
  type SecurityEvent,
  type SessionRefreshToken,
  type TwoFactorChallenge,
} from '../src/modules/auth-security/index.js';

const policy: AuthSecurityPolicy = {
  accessTokenTtlMs: 60_000,
  refreshTokenTtlMs: 120_000,
  sessionAbsoluteTtlMs: 180_000,
  sessionIdleTtlMs: 90_000,
  passwordResetTokenTtlMs: 60_000,
  twoFactorChallengeTtlMs: 30_000,
  twoFactorMaxAttempts: 2,
  loginBlockThreshold: 3,
  blockDurationMs: 300_000,
  requireTwoFactor: false,
  refreshTokenReuseAction: 'revoke_session',
};

class FixedClock implements Clock {
  constructor(private current = new Date('2026-07-09T00:00:00.000Z')) {}
  now(): Date { return new Date(this.current); }
  advance(ms: number): void { this.current = new Date(this.current.getTime() + ms); }
}

class DeterministicSecrets implements SecretGenerator {
  readonly generated: string[] = [];
  private next = 0;
  generate(): string { this.next += 1; const value = `secret-${this.next}`; this.generated.push(value); return value; }
  hash(value: string): string { return `hash:${value}`; }
}

async function expectRejects(run: () => Promise<unknown>, expected: RegExp | (new (...args: never[]) => Error)): Promise<void> {
  let rejected: unknown = null;
  try {
    await run();
  } catch (error) {
    rejected = error;
  }
  if (rejected === null) throw new Error('Expected promise to reject');
  if (expected instanceof RegExp) {
    assert.equal(expected.test(rejected instanceof Error ? rejected.message : String(rejected)), true);
  } else {
    assert.equal(rejected instanceof expected, true);
  }
}

function makeHarness(customPolicy: AuthSecurityPolicy = policy) {
  const clock = new FixedClock();
  const secrets = new DeterministicSecrets();
  const users = new Map<string, AuthenticatedUser>([['admin@example.test', Object.freeze({ id: 'user-1', identifier: 'admin@example.test', status: 'active', metadata: Object.freeze({}) })]]);
  const credentials = new Map<string, AuthCredential>([['user-1', Object.freeze({ id: 'credential-1', userId: 'user-1', credentialType: 'password', credentialHash: 'hash:password-ok', status: 'active', lastChangedAt: clock.now().toISOString(), mustRotateAt: null, metadata: Object.freeze({}) })]]);
  const devices = new Map<string, DeviceFingerprint>();
  const sessions = new Map<string, LoginSession>();
  const refreshTokens = new Map<string, SessionRefreshToken>();
  const resetRequests = new Map<string, PasswordResetRequestRecord>();
  const twoFactorChallenges = new Map<string, TwoFactorChallenge>();
  const attempts: LoginAttempt[] = [];
  const events: SecurityEvent[] = [];

  const securityEvents = new SecurityEventService({ repository: {
    async record(event) { events.push(event); return event; },
    async listByUserId(userId) { return events.filter((event) => event.userId === userId); },
  }, clock });
  const sessionService = new SessionService({ repository: {
    async save(session) { sessions.set(session.id, session); return session; },
    async findById(sessionId) { return sessions.get(sessionId) ?? null; },
    async listActiveByUserId(userId) { return [...sessions.values()].filter((session) => session.userId === userId && session.status === 'active'); },
    async listActiveByDeviceId(deviceFingerprintId) { return [...sessions.values()].filter((session) => session.deviceFingerprintId === deviceFingerprintId && session.status === 'active'); },
  }, clock, policy: customPolicy, securityEvents });
  const deviceFingerprintService = new DeviceFingerprintService({ repository: {
    async findByUserIdAndHash(input) { return devices.get(`${input.userId}:${input.fingerprintHash}`) ?? null; },
    async save(device) { devices.set(`${device.userId}:${device.fingerprintHash}`, device); return device; },
    async listByUserId(userId) { return [...devices.values()].filter((device) => device.userId === userId); },
  }, secretGenerator: secrets, clock, securityEvents, sessionService });
  const refreshTokenRepository: RefreshTokenRepository = {
    async save(token) { refreshTokens.set(token.tokenHash, token); return token; },
    async findByHash(tokenHash) { return refreshTokens.get(tokenHash) ?? null; },
    async rotateActive(input) {
      const existing = refreshTokens.get(input.tokenHash);
      if (existing === undefined || existing.status !== 'active') return null;
      const previous = Object.freeze({ ...existing, status: 'rotated' as const, rotatedAt: input.rotatedAt, replacedByTokenId: input.nextToken.id });
      refreshTokens.set(input.tokenHash, previous);
      refreshTokens.set(input.nextToken.tokenHash, input.nextToken);
      return { previous, next: input.nextToken };
    },
    async markReused(input) {
      const existing = refreshTokens.get(input.tokenHash);
      if (existing === undefined) return null;
      const reused = Object.freeze({ ...existing, status: 'reused' as const, revokedAt: input.reusedAt });
      refreshTokens.set(input.tokenHash, reused);
      return reused;
    },
  };
  const refreshTokenService = new RefreshTokenService({ repository: refreshTokenRepository, sessionService, secretGenerator: secrets, clock, policy: customPolicy, securityEvents });
  const twoFactorService = new TwoFactorService({ repository: {
    async save(challenge) { twoFactorChallenges.set(challenge.id, challenge); return challenge; },
    async findById(challengeId) { return twoFactorChallenges.get(challengeId) ?? null; },
  }, secretGenerator: secrets, clock, policy: customPolicy, securityEvents });
  const userRepository = { async findByIdentifier(identifier: string) { return users.get(identifier) ?? null; } };
  const credentialRepository = {
    async findActivePasswordCredentialByUserId(userId: string) { return credentials.get(userId) ?? null; },
    async replacePasswordCredential(input: { userId: string; credentialHash: string; changedAt: string; metadata?: Record<string, unknown> }) {
      const credential = Object.freeze({ id: `credential-${credentials.size + 1}`, userId: input.userId, credentialType: 'password', credentialHash: input.credentialHash, status: 'active' as const, lastChangedAt: input.changedAt, mustRotateAt: null, metadata: Object.freeze({ ...(input.metadata ?? {}) }) });
      credentials.set(input.userId, credential);
      return credential;
    },
  };
  const passwordResetService = new PasswordResetService({ repository: {
    async save(request) { resetRequests.set(request.tokenHash, request); return request; },
    async findByTokenHash(tokenHash) { return resetRequests.get(tokenHash) ?? null; },
  }, userRepository, credentialRepository, sessionService, secretGenerator: secrets, clock, policy: customPolicy, securityEvents });
  const authService = new AuthService({
    userRepository,
    credentialRepository,
    loginAttemptRepository: {
      async record(attempt) { attempts.push(attempt); return attempt; },
      async countRecentFailures(input) { return attempts.filter((attempt) => attempt.identifierHash === input.identifierHash && attempt.outcome === 'failed' && attempt.occurredAt >= input.since && attempt.occurredAt <= input.now).length; },
    },
    deviceFingerprintService,
    sessionService,
    refreshTokenService,
    twoFactorService,
    securityEvents,
    passwordVerifier: { verify: (input) => input.credentialHash === secrets.hash(input.password) },
    secretGenerator: secrets,
    clock,
    policy: customPolicy,
  });

  return { authService, sessionService, refreshTokenService, passwordResetService, deviceFingerprintService, twoFactorService, securityEvents, clock, secrets, users, credentials, devices, sessions, refreshTokens, resetRequests, twoFactorChallenges, attempts, events };
}

test('AuthService authenticates with abstract repositories and records session, device, token, attempt, event, and hashed IP', async () => {
  const harness = makeHarness();
  const result = await harness.authService.login({ identifier: 'admin@example.test', password: 'password-ok', device: { fingerprint: 'browser-1', ipAddress: '203.0.113.10', metadata: { platform: 'test' } } });

  assert.equal(result.requiresTwoFactor, false);
  assert.equal(result.accessToken, 'secret-2');
  assert.equal(result.refreshToken, 'secret-1');
  assert.equal(result.session?.userId, 'user-1');
  assert.equal(harness.devices.size, 1);
  assert.equal(harness.refreshTokens.size, 1);
  assert.equal(harness.attempts[0]?.outcome, 'succeeded');
  assert.equal(harness.attempts[0]?.ipAddressHash, 'hash:203.0.113.10');
  assert.equal(harness.events.some((event) => event.eventType === 'auth.login_succeeded'), true);
});

test('AuthService rejects invalid credentials and blocks according to configurable policy', async () => {
  const harness = makeHarness({ ...policy, loginBlockThreshold: 1 });

  await expectRejects(() => harness.authService.login({ identifier: 'admin@example.test', password: 'wrong' }), ForbiddenError);
  await expectRejects(() => harness.authService.login({ identifier: 'admin@example.test', password: 'password-ok' }), /bloquée/);
  assert.equal(harness.attempts[0]?.outcome, 'failed');
  assert.equal(harness.attempts[1]?.outcome, 'blocked');
});

test('AuthService returns a persisted two-factor challenge when policy requires it without creating a session', async () => {
  const harness = makeHarness({ ...policy, requireTwoFactor: true, twoFactorChallengeTtlMs: 45_000 });
  const result = await harness.authService.login({ identifier: 'admin@example.test', password: 'password-ok' });

  assert.equal(result.requiresTwoFactor, true);
  assert.equal(result.session, null);
  assert.equal(result.refreshToken, null);
  assert.equal(result.challenge?.status, 'pending');
  assert.equal(result.challenge?.expiresAt, '2026-07-09T00:00:45.000Z');
  assert.equal(harness.twoFactorChallenges.size, 1);
  assert.equal(harness.sessions.size, 0);
});

test('TwoFactorService verifies success, failed attempts, max attempts, and expiration', async () => {
  const successHarness = makeHarness({ ...policy, twoFactorMaxAttempts: 2, twoFactorChallengeTtlMs: 10_000 });
  const created = await successHarness.twoFactorService.create({ userId: 'user-1' });
  const verified = await successHarness.twoFactorService.verify({ challengeId: created.challenge.id, code: created.verificationCode });
  assert.equal(verified.status, 'succeeded');
  assert.equal(verified.verifiedAt, successHarness.clock.now().toISOString());

  const failureHarness = makeHarness({ ...policy, twoFactorMaxAttempts: 2 });
  const failedCreated = await failureHarness.twoFactorService.create({ userId: 'user-1' });
  await expectRejects(() => failureHarness.twoFactorService.verify({ challengeId: failedCreated.challenge.id, code: 'bad-1' }), /invalide/);
  await expectRejects(() => failureHarness.twoFactorService.verify({ challengeId: failedCreated.challenge.id, code: 'bad-2' }), /invalide/);
  assert.equal(failureHarness.twoFactorChallenges.get(failedCreated.challenge.id)?.status, 'failed');
  assert.equal(failureHarness.twoFactorChallenges.get(failedCreated.challenge.id)?.attempts, 2);

  const expiredHarness = makeHarness({ ...policy, twoFactorChallengeTtlMs: 1_000 });
  const expiredCreated = await expiredHarness.twoFactorService.create({ userId: 'user-1' });
  expiredHarness.clock.advance(1_001);
  await expectRejects(() => expiredHarness.twoFactorService.verify({ challengeId: expiredCreated.challenge.id, code: expiredCreated.verificationCode }), /expiré/);
  assert.equal(expiredHarness.twoFactorChallenges.get(expiredCreated.challenge.id)?.status, 'expired');
});

test('SessionService creates, validates, expires, and revokes revocable sessions', async () => {
  const harness = makeHarness({ ...policy, sessionAbsoluteTtlMs: 2_000, sessionIdleTtlMs: 1_000 });
  const session = await harness.sessionService.create({ userId: 'user-1', deviceFingerprintId: 'device-1' });

  assert.equal((await harness.sessionService.assertActive(session.id)).id, session.id);
  harness.clock.advance(1_001);
  await expectRejects(() => harness.sessionService.assertActive(session.id), /expirée/);

  const revokeHarness = makeHarness();
  const revocable = await revokeHarness.sessionService.create({ userId: 'user-1', deviceFingerprintId: 'device-1' });
  const revoked = await revokeHarness.sessionService.revoke({ session: revocable, actorUserId: 'admin', reason: 'manual-test' });
  assert.equal(revoked.status, 'revoked');
  await expectRejects(() => revokeHarness.sessionService.assertActive(revocable.id), /inactive/);
});

test('RefreshTokenService rotates tokens atomically and marks reused tokens according to session revocation policy', async () => {
  const harness = makeHarness({ ...policy, refreshTokenReuseAction: 'revoke_session' });
  const session = await harness.sessionService.create({ userId: 'user-1' });
  const issued = await harness.refreshTokenService.issue({ sessionId: session.id });
  const rotated = await harness.refreshTokenService.rotate({ refreshToken: issued.refreshToken });

  assert.equal(rotated.previous.status, 'rotated');
  assert.equal(rotated.previous.replacedByTokenId, rotated.record.id);
  assert.equal(harness.refreshTokens.size, 2);
  await expectRejects(() => harness.refreshTokenService.rotate({ refreshToken: issued.refreshToken }), /réutilisé/);
  assert.equal(harness.refreshTokens.get(issued.record.tokenHash)?.status, 'reused');
  assert.equal(harness.sessions.get(session.id)?.status, 'revoked');
  assert.equal(harness.events.some((event) => event.eventType === 'refresh_token.reused' && event.severity === 'critical'), true);
});

test('RefreshTokenService can revoke all user sessions on token reuse and rejects expired tokens distinctly', async () => {
  const harness = makeHarness({ ...policy, refreshTokenReuseAction: 'revoke_user_sessions', refreshTokenTtlMs: 1_000 });
  const firstSession = await harness.sessionService.create({ userId: 'user-1' });
  const secondSession = await harness.sessionService.create({ userId: 'user-1' });
  const issued = await harness.refreshTokenService.issue({ sessionId: firstSession.id });
  await harness.refreshTokenService.rotate({ refreshToken: issued.refreshToken });
  await expectRejects(() => harness.refreshTokenService.rotate({ refreshToken: issued.refreshToken }), /réutilisé/);
  assert.equal(harness.sessions.get(firstSession.id)?.status, 'revoked');
  assert.equal(harness.sessions.get(secondSession.id)?.status, 'revoked');

  const expiredHarness = makeHarness({ ...policy, refreshTokenTtlMs: 1_000 });
  const session = await expiredHarness.sessionService.create({ userId: 'user-1' });
  const expired = await expiredHarness.refreshTokenService.issue({ sessionId: session.id });
  expiredHarness.clock.advance(1_001);
  await expectRejects(() => expiredHarness.refreshTokenService.rotate({ refreshToken: expired.refreshToken }), /expiré/);
  assert.equal(expiredHarness.refreshTokens.get(expired.record.tokenHash)?.status, 'expired');
});

test('PasswordResetService request is neutral, hashes tokens, rejects expired tokens, replaces credentials, and revokes sessions', async () => {
  const harness = makeHarness({ ...policy, passwordResetTokenTtlMs: 1_000 });
  const activeSession = await harness.sessionService.create({ userId: 'user-1' });
  const unknown = await harness.passwordResetService.request({ identifier: 'missing@example.test' });
  const known = await harness.passwordResetService.request({ identifier: 'admin@example.test' });

  assert.equal(JSON.stringify(unknown), JSON.stringify({ accepted: true }));
  assert.equal(JSON.stringify(known), JSON.stringify({ accepted: true }));
  assert.equal(Object.prototype.hasOwnProperty.call(known, 'resetToken'), false);
  assert.equal([...harness.resetRequests.values()].every((request) => request.tokenHash.startsWith('hash:')), true);

  const knownToken = harness.secrets.generated[harness.secrets.generated.length - 1] ?? '';
  harness.clock.advance(1_001);
  await expectRejects(() => harness.passwordResetService.confirm({ resetToken: knownToken, newCredentialHash: 'hash:new-password' }), /invalide/);

  const freshHarness = makeHarness();
  const freshSession = await freshHarness.sessionService.create({ userId: 'user-1' });
  await freshHarness.passwordResetService.request({ identifier: 'admin@example.test' });
  const freshToken = freshHarness.secrets.generated[freshHarness.secrets.generated.length - 1] ?? '';
  const completed = await freshHarness.passwordResetService.confirm({ resetToken: freshToken, newCredentialHash: 'hash:new-password' });
  assert.equal(completed.status, 'completed');
  assert.equal(freshHarness.credentials.get('user-1')?.credentialHash, 'hash:new-password');
  assert.equal(freshHarness.sessions.get(freshSession.id)?.status, 'revoked');
  assert.equal(harness.sessions.get(activeSession.id)?.status, 'active');
});

test('DeviceFingerprintService creates, updates, revokes device fingerprints, and revokes linked sessions', async () => {
  const harness = makeHarness();
  const first = await harness.deviceFingerprintService.identify({ userId: 'user-1', device: { fingerprint: 'device-secret', metadata: { version: 1 } } });
  const second = await harness.deviceFingerprintService.identify({ userId: 'user-1', device: { fingerprint: 'device-secret', metadata: { version: 2 } } });
  const linkedSession = await harness.sessionService.create({ userId: 'user-1', deviceFingerprintId: second?.id ?? null });

  assert.equal(first?.fingerprintHash, 'hash:device-secret');
  assert.equal(second?.id, first?.id);
  assert.equal(second?.lastSeenAt, harness.clock.now().toISOString());
  assert.equal(Object.prototype.hasOwnProperty.call(second ?? {}, 'fingerprint'), false);

  const revoked = await harness.deviceFingerprintService.revoke({ device: second as DeviceFingerprint, actorUserId: 'admin', reason: 'lost-device' });
  assert.equal(revoked.status, 'revoked');
  assert.equal(harness.sessions.get(linkedSession.id)?.status, 'revoked');
});

test('AuthService refuses login from a revoked device', async () => {
  const harness = makeHarness();
  const device = await harness.deviceFingerprintService.identify({ userId: 'user-1', device: { fingerprint: 'revoked-device' } });
  await harness.deviceFingerprintService.revoke({ device: device as DeviceFingerprint, actorUserId: 'admin', reason: 'lost' });

  await expectRejects(() => harness.authService.login({ identifier: 'admin@example.test', password: 'password-ok', device: { fingerprint: 'revoked-device' } }), /révoqué/);
  assert.equal(harness.attempts[harness.attempts.length - 1]?.outcome, 'blocked');
  assert.equal(harness.attempts[harness.attempts.length - 1]?.failureReason, 'device_revoked');
});

test('SecurityEventService records deeply immutable events and can list them by user', async () => {
  const harness = makeHarness();
  const event = await harness.securityEvents.record({ userId: 'user-1', eventType: 'security.test', severity: 'info', metadata: { nested: { source: 'unit' } } });

  assert.throws(() => { ((event.metadata.nested as Record<string, unknown>)).source = 'mutated'; });
  const events = await harness.securityEvents.listByUserId('user-1');
  assert.equal(events.length, 1);
  assert.equal(events[0]?.eventType, 'security.test');
});

test('Auth/Security services reject invalid configurable policies', () => {
  assert.throws(() => makeHarness({ ...policy, twoFactorChallengeTtlMs: 0 }), /twoFactorChallengeTtlMs/);
  assert.throws(() => makeHarness({ ...policy, twoFactorMaxAttempts: 0 }), /tentatives 2FA/);
  assert.throws(() => makeHarness({ ...policy, loginBlockThreshold: 0 }), /seuil de blocage/);
});
