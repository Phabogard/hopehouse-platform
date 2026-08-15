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

export function resolveAuthSecurityPolicyValue(value: unknown, fallback: AuthSecurityPolicy = defaultAuthSecurityPolicy): AuthSecurityPolicy {
  if (!isRuntimePolicyValue(value)) throw new ValidationError('Politique auth-security invalide');
  return Object.freeze({
    accessTokenTtlMs: value.accessTokenTtlMs === undefined ? fallback.accessTokenTtlMs : boundedInteger(value.accessTokenTtlMs, 'accessTokenTtlMs'),
    refreshTokenTtlMs: value.refreshTokenTtlMs === undefined ? fallback.refreshTokenTtlMs : boundedInteger(value.refreshTokenTtlMs, 'refreshTokenTtlMs'),
    sessionAbsoluteTtlMs: value.sessionAbsoluteTtlMs === undefined ? fallback.sessionAbsoluteTtlMs : boundedInteger(value.sessionAbsoluteTtlMs, 'sessionAbsoluteTtlMs'),
    sessionIdleTtlMs: value.sessionIdleTtlMs === undefined ? fallback.sessionIdleTtlMs : optionalIdleTtl(value.sessionIdleTtlMs),
    passwordResetTokenTtlMs: value.passwordResetTokenTtlMs === undefined ? fallback.passwordResetTokenTtlMs : boundedInteger(value.passwordResetTokenTtlMs, 'passwordResetTokenTtlMs'),
    twoFactorChallengeTtlMs: value.twoFactorChallengeTtlMs === undefined ? fallback.twoFactorChallengeTtlMs : boundedInteger(value.twoFactorChallengeTtlMs, 'twoFactorChallengeTtlMs'),
    twoFactorMaxAttempts: value.twoFactorMaxAttempts === undefined ? fallback.twoFactorMaxAttempts : boundedInteger(value.twoFactorMaxAttempts, 'twoFactorMaxAttempts'),
    loginBlockThreshold: value.loginBlockThreshold === undefined ? fallback.loginBlockThreshold : boundedInteger(value.loginBlockThreshold, 'loginBlockThreshold'),
    blockDurationMs: value.blockDurationMs === undefined ? fallback.blockDurationMs : boundedInteger(value.blockDurationMs, 'blockDurationMs'),
    requireTwoFactor: requireTwoFactor(value.requireTwoFactor, fallback.requireTwoFactor),
    refreshTokenReuseAction: value.refreshTokenReuseAction === undefined ? fallback.refreshTokenReuseAction : refreshTokenReuseAction(value.refreshTokenReuseAction),
  });
}

export async function resolveAuthSecurityPolicy(input: { configuration: ConfigurationService; fallback?: AuthSecurityPolicy }): Promise<AuthSecurityPolicy> {
  const fallback = input.fallback ?? defaultAuthSecurityPolicy;
  const setting = await input.configuration.resolve(authSecurityPolicySetting);
  if (setting === null) return fallback;
  try {
    return resolveAuthSecurityPolicyValue(setting.value, fallback);
  } catch {
    return fallback;
  }
}
