import type { AuthCredential, AuthenticatedUser, DeviceFingerprint, LoginAttempt, LoginSession, PasswordResetRequestRecord, SecurityEvent, SessionRefreshToken, TwoFactorChallenge } from './types.js';

export interface AuthUserRepository {
  findByIdentifier(identifier: string): Promise<AuthenticatedUser | null>;
}

export interface AuthCredentialRepository {
  findActivePasswordCredentialByUserId(userId: string): Promise<AuthCredential | null>;
  replacePasswordCredential(input: { userId: string; credentialHash: string; changedAt: string; metadata?: Record<string, unknown> }): Promise<AuthCredential>;
}

export interface LoginAttemptRepository {
  record(attempt: LoginAttempt): Promise<LoginAttempt>;
  countRecentFailures(input: { identifierHash: string; since: string; now: string }): Promise<number>;
}

export interface DeviceFingerprintRepository {
  findByUserIdAndHash(input: { userId: string; fingerprintHash: string }): Promise<DeviceFingerprint | null>;
  save(device: DeviceFingerprint): Promise<DeviceFingerprint>;
  listByUserId(userId: string): Promise<readonly DeviceFingerprint[]>;
}

export interface SessionRepository {
  save(session: LoginSession): Promise<LoginSession>;
  findById(sessionId: string): Promise<LoginSession | null>;
  listActiveByUserId(userId: string): Promise<readonly LoginSession[]>;
  listActiveByDeviceId(deviceFingerprintId: string): Promise<readonly LoginSession[]>;
}

export interface RefreshTokenRepository {
  save(token: SessionRefreshToken): Promise<SessionRefreshToken>;
  findByHash(tokenHash: string): Promise<SessionRefreshToken | null>;
  rotateActive(input: { tokenHash: string; rotatedAt: string; nextToken: SessionRefreshToken }): Promise<{ previous: SessionRefreshToken; next: SessionRefreshToken } | null>;
  markReused(input: { tokenHash: string; reusedAt: string }): Promise<SessionRefreshToken | null>;
}

export interface PasswordResetRequestRepository {
  save(request: PasswordResetRequestRecord): Promise<PasswordResetRequestRecord>;
  findByTokenHash(tokenHash: string): Promise<PasswordResetRequestRecord | null>;
}

export interface TwoFactorChallengeRepository {
  save(challenge: TwoFactorChallenge): Promise<TwoFactorChallenge>;
  findById(challengeId: string): Promise<TwoFactorChallenge | null>;
}

export interface SecurityEventRepository {
  record(event: SecurityEvent): Promise<SecurityEvent>;
  listByUserId(userId: string): Promise<readonly SecurityEvent[]>;
}
