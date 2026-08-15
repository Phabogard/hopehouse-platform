import { ValidationError } from '../../core/errors.js';
import { ConfigurationService, type AppSettingScope } from '../configuration/index.js';
import type { AuthSecurityPolicy, RefreshTokenReuseAction } from './types.js';

export const authSecurityPolicySetting = Object.freeze({
  namespace: 'auth-security',
  key: 'runtime-policy',
  scope: Object.freeze({ type: 'global', id: null } satisfies AppSettingScope),
});

export const defaultAuthSecurityPolicy: AuthSecurityPolicy = Object.freeze({
  accessTokenTtlMs: 15 * 60 * 1000,
  refreshTokenTtlMs: 30 * 24 * 60 * 60 * 1000,
  sessionAbsoluteTtlMs: 30 * 24 * 60 * 60 * 1000,
  sessionIdleTtlMs: 7 * 24 * 60 * 60 * 1000,
  passwordResetTokenTtlMs: 15 * 60 * 1000,
  twoFactorChallengeTtlMs: 5 * 60 * 1000,
  twoFactorMaxAttempts: 3,
  loginBlockThreshold: 4,
  blockDurationMs: 24 * 60 * 60 * 1000,
  requireTwoFactor: false,
  refreshTokenReuseAction: 'revoke_session',
});

const policyBounds = Object.freeze({
  accessTokenTtlMs: Object.freeze({ min: 5 * 60 * 1000, max: 60 * 60 * 1000 }),
  refreshTokenTtlMs: Object.freeze({ min: 60 * 60 * 1000, max: 30 * 24 * 60 * 60 * 1000 }),
  sessionAbsoluteTtlMs: Object.freeze({ min: 60 * 60 * 1000, max: 30 * 24 * 60 * 60 * 1000 }),
  sessionIdleTtlMs: Object.freeze({ min: 15 * 60 * 1000, max: 7 * 24 * 60 * 60 * 1000 }),
  passwordResetTokenTtlMs: Object.freeze({ min: 5 * 60 * 1000, max: 60 * 60 * 1000 }),
  twoFactorChallengeTtlMs: Object.freeze({ min: 60 * 1000, max: 10 * 60 * 1000 }),
  twoFactorMaxAttempts: Object.freeze({ min: 1, max: 5 }),
  loginBlockThreshold: Object.freeze({ min: 1, max: 10 }),
  blockDurationMs: Object.freeze({ min: 15 * 60 * 1000, max: 7 * 24 * 60 * 60 * 1000 }),
});

type RuntimePolicyValue = Partial<Record<keyof AuthSecurityPolicy, unknown>>;

function isRuntimePolicyValue(value: unknown): value is RuntimePolicyValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function boundedInteger(value: unknown, field: keyof typeof policyBounds): number {
  const bounds = policyBounds[field];
  if (!Number.isInteger(value) || typeof value !== 'number' || value < bounds.min || value > bounds.max) throw new ValidationError('Politique auth-security invalide');
  return value;
}

function optionalIdleTtl(value: unknown): number | null {
  if (value === null) return null;
  return boundedInteger(value, 'sessionIdleTtlMs');
}

function requireTwoFactor(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new ValidationError('Politique auth-security invalide');
  if (fallback && !value) throw new ValidationError('Politique auth-security invalide');
  return value || fallback;
}

function refreshTokenReuseAction(value: unknown): RefreshTokenReuseAction {
  if (value === 'revoke_session' || value === 'revoke_user_sessions') return value;
  throw new ValidationError('Politique auth-security invalide');
}

function booleanPolicyValue(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new ValidationError('Politique auth-security invalide');
  return value;
}

export function normalizeAuthSecurityPolicy(value: Partial<AuthSecurityPolicy> = {}): AuthSecurityPolicy {
  return Object.freeze({
    accessTokenTtlMs: boundedInteger(value.accessTokenTtlMs ?? defaultAuthSecurityPolicy.accessTokenTtlMs, 'accessTokenTtlMs'),
    refreshTokenTtlMs: boundedInteger(value.refreshTokenTtlMs ?? defaultAuthSecurityPolicy.refreshTokenTtlMs, 'refreshTokenTtlMs'),
    sessionAbsoluteTtlMs: boundedInteger(value.sessionAbsoluteTtlMs ?? defaultAuthSecurityPolicy.sessionAbsoluteTtlMs, 'sessionAbsoluteTtlMs'),
    sessionIdleTtlMs: value.sessionIdleTtlMs === undefined ? defaultAuthSecurityPolicy.sessionIdleTtlMs : optionalIdleTtl(value.sessionIdleTtlMs),
    passwordResetTokenTtlMs: boundedInteger(value.passwordResetTokenTtlMs ?? defaultAuthSecurityPolicy.passwordResetTokenTtlMs, 'passwordResetTokenTtlMs'),
    twoFactorChallengeTtlMs: boundedInteger(value.twoFactorChallengeTtlMs ?? defaultAuthSecurityPolicy.twoFactorChallengeTtlMs, 'twoFactorChallengeTtlMs'),
    twoFactorMaxAttempts: boundedInteger(value.twoFactorMaxAttempts ?? defaultAuthSecurityPolicy.twoFactorMaxAttempts, 'twoFactorMaxAttempts'),
    loginBlockThreshold: boundedInteger(value.loginBlockThreshold ?? defaultAuthSecurityPolicy.loginBlockThreshold, 'loginBlockThreshold'),
    blockDurationMs: boundedInteger(value.blockDurationMs ?? defaultAuthSecurityPolicy.blockDurationMs, 'blockDurationMs'),
    requireTwoFactor: value.requireTwoFactor === undefined ? defaultAuthSecurityPolicy.requireTwoFactor : booleanPolicyValue(value.requireTwoFactor),
    refreshTokenReuseAction: value.refreshTokenReuseAction === undefined ? defaultAuthSecurityPolicy.refreshTokenReuseAction : refreshTokenReuseAction(value.refreshTokenReuseAction),
  });
}

export function resolveAuthSecurityPolicyValue(value: unknown, fallback: AuthSecurityPolicy = defaultAuthSecurityPolicy): AuthSecurityPolicy {
  const safeFallback = normalizeAuthSecurityPolicy(fallback);
  if (!isRuntimePolicyValue(value)) throw new ValidationError('Politique auth-security invalide');
  return Object.freeze({
    accessTokenTtlMs: value.accessTokenTtlMs === undefined ? safeFallback.accessTokenTtlMs : boundedInteger(value.accessTokenTtlMs, 'accessTokenTtlMs'),
    refreshTokenTtlMs: value.refreshTokenTtlMs === undefined ? safeFallback.refreshTokenTtlMs : boundedInteger(value.refreshTokenTtlMs, 'refreshTokenTtlMs'),
    sessionAbsoluteTtlMs: value.sessionAbsoluteTtlMs === undefined ? safeFallback.sessionAbsoluteTtlMs : boundedInteger(value.sessionAbsoluteTtlMs, 'sessionAbsoluteTtlMs'),
    sessionIdleTtlMs: value.sessionIdleTtlMs === undefined ? safeFallback.sessionIdleTtlMs : optionalIdleTtl(value.sessionIdleTtlMs),
    passwordResetTokenTtlMs: value.passwordResetTokenTtlMs === undefined ? safeFallback.passwordResetTokenTtlMs : boundedInteger(value.passwordResetTokenTtlMs, 'passwordResetTokenTtlMs'),
    twoFactorChallengeTtlMs: value.twoFactorChallengeTtlMs === undefined ? safeFallback.twoFactorChallengeTtlMs : boundedInteger(value.twoFactorChallengeTtlMs, 'twoFactorChallengeTtlMs'),
    twoFactorMaxAttempts: value.twoFactorMaxAttempts === undefined ? safeFallback.twoFactorMaxAttempts : boundedInteger(value.twoFactorMaxAttempts, 'twoFactorMaxAttempts'),
    loginBlockThreshold: value.loginBlockThreshold === undefined ? safeFallback.loginBlockThreshold : boundedInteger(value.loginBlockThreshold, 'loginBlockThreshold'),
    blockDurationMs: value.blockDurationMs === undefined ? safeFallback.blockDurationMs : boundedInteger(value.blockDurationMs, 'blockDurationMs'),
    requireTwoFactor: requireTwoFactor(value.requireTwoFactor, safeFallback.requireTwoFactor),
    refreshTokenReuseAction: value.refreshTokenReuseAction === undefined ? safeFallback.refreshTokenReuseAction : refreshTokenReuseAction(value.refreshTokenReuseAction),
  });
}

export async function resolveAuthSecurityPolicy(input: { configuration: ConfigurationService; fallback?: Partial<AuthSecurityPolicy> }): Promise<AuthSecurityPolicy> {
  const fallback = normalizeAuthSecurityPolicy(input.fallback);
  const setting = await input.configuration.resolve(authSecurityPolicySetting);
  if (setting === null) return fallback;
  try {
    return resolveAuthSecurityPolicyValue(setting.value, fallback);
  } catch {
    return fallback;
  }
}
