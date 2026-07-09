export type CredentialStatus = 'active' | 'disabled' | 'rotated' | 'archived';
export type DeviceStatus = 'pending' | 'trusted' | 'untrusted' | 'revoked' | 'archived';
export type SessionStatus = 'active' | 'revoked' | 'expired' | 'archived';
export type RefreshTokenStatus = 'active' | 'rotated' | 'revoked' | 'expired' | 'reused';
export type RefreshTokenReuseAction = 'record_only' | 'revoke_session' | 'revoke_user_sessions';
export type LoginAttemptOutcome = 'succeeded' | 'failed' | 'blocked';
export type SecurityEventSeverity = 'info' | 'medium' | 'major' | 'critical';
export type PasswordResetStatus = 'pending' | 'completed' | 'expired' | 'revoked';
export type TwoFactorChallengeStatus = 'pending' | 'succeeded' | 'failed' | 'expired';

export interface Clock {
  now(): Date;
}

export interface SecretGenerator {
  generate(): string;
  hash(value: string): string;
}

export interface PasswordVerifier {
  verify(input: { password: string; credentialHash: string }): boolean;
}

export interface AuthSecurityPolicy {
  accessTokenTtlMs: number;
  refreshTokenTtlMs: number;
  sessionAbsoluteTtlMs: number;
  sessionIdleTtlMs: number | null;
  passwordResetTokenTtlMs: number;
  twoFactorChallengeTtlMs: number;
  twoFactorMaxAttempts: number;
  loginBlockThreshold: number;
  blockDurationMs: number;
  requireTwoFactor: boolean;
  refreshTokenReuseAction: RefreshTokenReuseAction;
}

export interface DeviceContext {
  fingerprint?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AuthCredential {
  id: string;
  userId: string;
  credentialType: string;
  credentialHash: string;
  status: CredentialStatus;
  lastChangedAt: string;
  mustRotateAt: string | null;
  metadata: Readonly<Record<string, unknown>>;
}

export interface AuthenticatedUser {
  id: string;
  identifier: string;
  status: 'active' | 'inactive' | 'suspended' | 'archived';
  metadata: Readonly<Record<string, unknown>>;
}

export interface DeviceFingerprint {
  id: string;
  userId: string;
  fingerprintHash: string;
  label: string | null;
  status: DeviceStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
  revokedByUserId: string | null;
  metadata: Readonly<Record<string, unknown>>;
}

export interface LoginSession {
  id: string;
  userId: string;
  deviceFingerprintId: string | null;
  status: SessionStatus;
  issuedAt: string;
  expiresAt: string;
  idleExpiresAt: string | null;
  lastSeenAt: string | null;
  revokedAt: string | null;
  revokedByUserId: string | null;
  revocationReason: string | null;
  metadata: Readonly<Record<string, unknown>>;
}

export interface SessionRefreshToken {
  id: string;
  sessionId: string;
  tokenHash: string;
  status: RefreshTokenStatus;
  issuedAt: string;
  expiresAt: string;
  rotatedAt: string | null;
  revokedAt: string | null;
  replacedByTokenId: string | null;
  metadata: Readonly<Record<string, unknown>>;
}

export interface LoginAttempt {
  id: string;
  userId: string | null;
  identifierHash: string;
  deviceFingerprintId: string | null;
  ipAddressHash: string | null;
  outcome: LoginAttemptOutcome;
  failureReason: string | null;
  occurredAt: string;
  metadata: Readonly<Record<string, unknown>>;
}

export interface SecurityEvent {
  id: string;
  userId: string | null;
  actorUserId: string | null;
  eventType: string;
  severity: SecurityEventSeverity;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  occurredAt: string;
  metadata: Readonly<Record<string, unknown>>;
}

export interface PasswordResetRequestRecord {
  id: string;
  userId: string | null;
  identifierHash: string;
  tokenHash: string;
  status: PasswordResetStatus;
  expiresAt: string;
  completedAt: string | null;
  createdAt: string;
  metadata: Readonly<Record<string, unknown>>;
}

export interface TwoFactorChallenge {
  id: string;
  userId: string;
  method: string;
  codeHash: string;
  status: TwoFactorChallengeStatus;
  attempts: number;
  maxAttempts: number;
  expiresAt: string;
  verifiedAt: string | null;
  createdAt: string;
  metadata: Readonly<Record<string, unknown>>;
}
