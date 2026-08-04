import { createHash, randomBytes } from 'node:crypto';
import type { AuthCredentialRepository, AuthUserRepository, DeviceFingerprintRepository, LoginAttemptRepository, PasswordResetRequestRepository, RefreshTokenRepository, SecurityEventRepository, SessionRepository, TwoFactorChallengeRepository } from './repositories.js';
import type { AuthCredential, AuthenticatedUser, Clock, DeviceFingerprint, LoginAttempt, LoginSession, PasswordResetRequestRecord, PasswordVerifier, SecretGenerator, SecurityEvent, SessionRefreshToken, TwoFactorChallenge } from './types.js';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export class NodeSecretGenerator implements SecretGenerator {
  generate(): string { return randomBytes(32).toString('base64url'); }
  hash(value: string): string { return `sha256:${sha256Hex(value)}`; }
}

export class HashPasswordVerifier implements PasswordVerifier {
  constructor(private readonly secrets: SecretGenerator) {}
  verify(input: { password: string; credentialHash: string }): boolean {
    return this.secrets.hash(input.password) === input.credentialHash;
  }
}

export class SystemClock implements Clock {
  now(): Date { return new Date(); }
}

export class InMemoryAuthUserRepository implements AuthUserRepository {
  private readonly usersByIdentifier = new Map<string, AuthenticatedUser>();
  private readonly usersById = new Map<string, AuthenticatedUser>();

  constructor(users: readonly AuthenticatedUser[] = []) {
    for (const user of users) this.save(user);
  }

  save(user: AuthenticatedUser): AuthenticatedUser {
    this.usersByIdentifier.set(user.identifier, user);
    this.usersById.set(user.id, user);
    return user;
  }

  async findByIdentifier(identifier: string): Promise<AuthenticatedUser | null> {
    return this.usersByIdentifier.get(identifier) ?? null;
  }

  async findById(userId: string): Promise<AuthenticatedUser | null> {
    return this.usersById.get(userId) ?? null;
  }
}

export class InMemoryAuthCredentialRepository implements AuthCredentialRepository {
  private readonly credentialsByUserId = new Map<string, AuthCredential>();

  constructor(credentials: readonly AuthCredential[] = []) {
    for (const credential of credentials) this.credentialsByUserId.set(credential.userId, credential);
  }

  async findActivePasswordCredentialByUserId(userId: string): Promise<AuthCredential | null> {
    const credential = this.credentialsByUserId.get(userId) ?? null;
    return credential?.status === 'active' && credential.credentialType === 'password' ? credential : null;
  }

  async replacePasswordCredential(input: { userId: string; credentialHash: string; changedAt: string; metadata?: Record<string, unknown> }): Promise<AuthCredential> {
    const credential: AuthCredential = Object.freeze({ id: `credential-${this.credentialsByUserId.size + 1}`, userId: input.userId, credentialType: 'password', credentialHash: input.credentialHash, status: 'active', lastChangedAt: input.changedAt, mustRotateAt: null, metadata: Object.freeze({ ...(input.metadata ?? {}) }) });
    this.credentialsByUserId.set(input.userId, credential);
    return credential;
  }
}

export class InMemoryLoginAttemptRepository implements LoginAttemptRepository {
  private readonly attempts: LoginAttempt[] = [];
  async record(attempt: LoginAttempt): Promise<LoginAttempt> { this.attempts.push(attempt); return attempt; }
  async countRecentFailures(input: { identifierHash: string; since: string; now: string }): Promise<number> {
    return this.attempts.filter((attempt) => attempt.identifierHash === input.identifierHash && attempt.outcome === 'failed' && attempt.occurredAt >= input.since && attempt.occurredAt <= input.now).length;
  }
  list(): readonly LoginAttempt[] { return Object.freeze([...this.attempts]); }
}

export class InMemoryDeviceFingerprintRepository implements DeviceFingerprintRepository {
  private readonly devices = new Map<string, DeviceFingerprint>();
  async findByUserIdAndHash(input: { userId: string; fingerprintHash: string }): Promise<DeviceFingerprint | null> { return this.devices.get(`${input.userId}:${input.fingerprintHash}`) ?? null; }
  async save(device: DeviceFingerprint): Promise<DeviceFingerprint> { this.devices.set(`${device.userId}:${device.fingerprintHash}`, device); return device; }
  async listByUserId(userId: string): Promise<readonly DeviceFingerprint[]> { return [...this.devices.values()].filter((device) => device.userId === userId); }
}

export class InMemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, LoginSession>();
  async save(session: LoginSession): Promise<LoginSession> { this.sessions.set(session.id, session); return session; }
  async findById(sessionId: string): Promise<LoginSession | null> { return this.sessions.get(sessionId) ?? null; }
  async listActiveByUserId(userId: string): Promise<readonly LoginSession[]> { return [...this.sessions.values()].filter((session) => session.userId === userId && session.status === 'active'); }
  async listActiveByDeviceId(deviceFingerprintId: string): Promise<readonly LoginSession[]> { return [...this.sessions.values()].filter((session) => session.deviceFingerprintId === deviceFingerprintId && session.status === 'active'); }
}

export class InMemoryRefreshTokenRepository implements RefreshTokenRepository {
  private readonly tokens = new Map<string, SessionRefreshToken>();
  async save(token: SessionRefreshToken): Promise<SessionRefreshToken> { this.tokens.set(token.tokenHash, token); return token; }
  async findByHash(tokenHash: string): Promise<SessionRefreshToken | null> { return this.tokens.get(tokenHash) ?? null; }
  async rotateActive(input: { tokenHash: string; rotatedAt: string; nextToken: SessionRefreshToken }): Promise<{ previous: SessionRefreshToken; next: SessionRefreshToken } | null> {
    const existing = this.tokens.get(input.tokenHash);
    if (existing === undefined || existing.status !== 'active') return null;
    const previous = Object.freeze({ ...existing, status: 'rotated' as const, rotatedAt: input.rotatedAt, replacedByTokenId: input.nextToken.id });
    this.tokens.set(input.tokenHash, previous);
    this.tokens.set(input.nextToken.tokenHash, input.nextToken);
    return { previous, next: input.nextToken };
  }
  async markReused(input: { tokenHash: string; reusedAt: string }): Promise<SessionRefreshToken | null> {
    const existing = this.tokens.get(input.tokenHash);
    if (existing === undefined) return null;
    const reused = Object.freeze({ ...existing, status: 'reused' as const, revokedAt: input.reusedAt });
    this.tokens.set(input.tokenHash, reused);
    return reused;
  }
}

export class InMemoryPasswordResetRequestRepository implements PasswordResetRequestRepository {
  private readonly requests = new Map<string, PasswordResetRequestRecord>();
  async save(request: PasswordResetRequestRecord): Promise<PasswordResetRequestRecord> { this.requests.set(request.tokenHash, request); return request; }
  async findByTokenHash(tokenHash: string): Promise<PasswordResetRequestRecord | null> { return this.requests.get(tokenHash) ?? null; }
}

export class InMemoryTwoFactorChallengeRepository implements TwoFactorChallengeRepository {
  private readonly challenges = new Map<string, TwoFactorChallenge>();
  async save(challenge: TwoFactorChallenge): Promise<TwoFactorChallenge> { this.challenges.set(challenge.id, challenge); return challenge; }
  async findById(challengeId: string): Promise<TwoFactorChallenge | null> { return this.challenges.get(challengeId) ?? null; }
}

export class InMemorySecurityEventRepository implements SecurityEventRepository {
  private readonly events: SecurityEvent[] = [];
  async record(event: SecurityEvent): Promise<SecurityEvent> { this.events.push(event); return event; }
  async listByUserId(userId: string): Promise<readonly SecurityEvent[]> { return this.events.filter((event) => event.userId === userId); }
  list(): readonly SecurityEvent[] { return Object.freeze([...this.events]); }
}
