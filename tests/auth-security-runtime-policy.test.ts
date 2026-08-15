import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAuthSecurityPolicy, resolveAuthSecurityPolicy, resolveAuthSecurityPolicyValue, defaultAuthSecurityPolicy } from '../src/modules/auth-security/policy.js';
import { ConfigurationService, InMemoryAppSettingRepository, type AppSetting } from '../src/modules/configuration/index.js';

const now = new Date('2026-08-14T00:00:00.000Z');
const globalScope = Object.freeze({ type: 'global', id: null });

async function assertRejectsInvalidPolicy(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    assert.equal(String(error).includes('auth-security invalide'), true);
    return;
  }
  throw new Error('invalid fallback should be rejected');
}

function setting(input: Partial<AppSetting> & { id: string; value?: unknown }): AppSetting {
  return Object.freeze({
    id: input.id,
    namespace: input.namespace ?? 'auth-security',
    key: input.key ?? 'runtime-policy',
    scope: input.scope ?? globalScope,
    status: input.status ?? 'active',
    value: input.value ?? Object.freeze({ requireTwoFactor: true, accessTokenTtlMs: 600_000 }),
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    createdByUserId: input.createdByUserId ?? 'system-admin',
    updatedByUserId: input.updatedByUserId ?? 'system-admin',
    createdAt: input.createdAt ?? '2026-08-01T00:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-08-01T00:00:00.000Z',
    metadata: input.metadata ?? Object.freeze({}),
  });
}

async function resolve(settings: readonly AppSetting[], fallback = defaultAuthSecurityPolicy) {
  const configuration = new ConfigurationService({ repository: new InMemoryAppSettingRepository(settings), clock: { now: () => now } });
  return resolveAuthSecurityPolicy({ configuration, fallback });
}

test('auth-security runtime policy resolves active global app_settings policy', async () => {
  const policy = await resolve([setting({ id: 'active', value: { requireTwoFactor: true, accessTokenTtlMs: 600_000, refreshTokenReuseAction: 'revoke_user_sessions' } })]);

  assert.equal(policy.requireTwoFactor, true);
  assert.equal(policy.accessTokenTtlMs, 600_000);
  assert.equal(policy.refreshTokenReuseAction, 'revoke_user_sessions');
  assert.equal(policy.refreshTokenTtlMs, defaultAuthSecurityPolicy.refreshTokenTtlMs);
});

test('auth-security runtime policy falls back safely when setting is absent or not applicable', async () => {
  for (const candidate of [
    undefined,
    setting({ id: 'draft', status: 'draft', value: { accessTokenTtlMs: 600_000, requireTwoFactor: true } }),
    setting({ id: 'future', startsAt: '2026-08-15T00:00:00.000Z', value: { accessTokenTtlMs: 600_000, requireTwoFactor: true } }),
    setting({ id: 'expired', endsAt: '2026-08-13T00:00:00.000Z', value: { accessTokenTtlMs: 600_000, requireTwoFactor: true } }),
    setting({ id: 'archived', status: 'archived', value: { accessTokenTtlMs: 600_000, requireTwoFactor: true } }),
  ]) {
    const policy = await resolve(candidate === undefined ? [] : [candidate]);
    assert.equal(JSON.stringify(policy), JSON.stringify(defaultAuthSecurityPolicy), candidate?.id);
  }
});

test('auth-security runtime policy rejects invalid JSON values and out-of-bounds values with safe fallback', async () => {
  for (const value of [
    'invalid-json-shape',
    { accessTokenTtlMs: 86_400_000 },
    { refreshTokenTtlMs: 31 * 24 * 60 * 60 * 1000 },
    { sessionAbsoluteTtlMs: 31 * 24 * 60 * 60 * 1000 },
    { passwordResetTokenTtlMs: 86_400_000 },
    { twoFactorChallengeTtlMs: 60 * 60 * 1000 },
    { twoFactorMaxAttempts: 99 },
    { loginBlockThreshold: 99 },
    { blockDurationMs: 1_000 },
    { refreshTokenReuseAction: 'record_only' },
  ]) {
    assert.equal(JSON.stringify(await resolve([setting({ id: 'invalid', value })])), JSON.stringify(defaultAuthSecurityPolicy));
  }
});

test('auth-security runtime policy does not leak across wrong scopes', async () => {
  const tenantSetting = setting({ id: 'tenant', scope: { type: 'tenant', id: 'tenant-1' }, value: { requireTwoFactor: true } });

  assert.equal(JSON.stringify(await resolve([tenantSetting])), JSON.stringify(defaultAuthSecurityPolicy));
});

test('auth-security runtime policy does not allow user or client preferences to lower mandatory system protections', async () => {
  const mandatory = Object.freeze({ ...defaultAuthSecurityPolicy, requireTwoFactor: true, sessionIdleTtlMs: 3_600_000, loginBlockThreshold: 2 });

  assert.throws(() => resolveAuthSecurityPolicyValue({ requireTwoFactor: false }, mandatory), /auth-security invalide/);
  assert.throws(() => resolveAuthSecurityPolicyValue({ sessionIdleTtlMs: 14 * 24 * 60 * 60 * 1000 }, mandatory), /auth-security invalide/);
  assert.throws(() => resolveAuthSecurityPolicyValue({ loginBlockThreshold: 99 }, mandatory), /auth-security invalide/);
});

test('auth-security runtime policy validates every injected fallback bound before use', async () => {
  for (const fallback of [
    { accessTokenTtlMs: 60_000 },
    { refreshTokenTtlMs: 30 * 60 * 1000 },
    { sessionAbsoluteTtlMs: 30 * 60 * 1000 },
    { sessionIdleTtlMs: 10 * 60 * 1000 },
    { passwordResetTokenTtlMs: 60_000 },
    { twoFactorChallengeTtlMs: 30 * 1000 },
    { twoFactorMaxAttempts: 0 },
    { loginBlockThreshold: 0 },
    { blockDurationMs: 60_000 },
    { requireTwoFactor: 'false' },
    { refreshTokenReuseAction: 'record_only' },
  ]) {
    assert.throws(() => normalizeAuthSecurityPolicy(fallback as never), /auth-security invalide/);
    await assertRejectsInvalidPolicy(() => resolve([], fallback as never));
  }
});

test('auth-security runtime policy normalizes valid partial fallbacks without changing defaults', () => {
  const policy = normalizeAuthSecurityPolicy({ requireTwoFactor: true, accessTokenTtlMs: 600_000 });

  assert.equal(policy.requireTwoFactor, true);
  assert.equal(policy.accessTokenTtlMs, 600_000);
  assert.equal(policy.refreshTokenTtlMs, defaultAuthSecurityPolicy.refreshTokenTtlMs);
  assert.equal(policy.refreshTokenReuseAction, defaultAuthSecurityPolicy.refreshTokenReuseAction);
});

test('auth-security runtime policy errors do not expose sensitive app_settings values', async () => {
  const secretValue = 'secret-token-that-must-not-leak';
  try {
    resolveAuthSecurityPolicyValue({ accessTokenTtlMs: secretValue });
    throw new Error('invalid policy should be rejected');
  } catch (error) {
    assert.equal(String(error).includes(secretValue), false);
  }
});
