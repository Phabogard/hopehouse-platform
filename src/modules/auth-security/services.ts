import { randomUUID } from 'node:crypto';
import { ForbiddenError, ValidationError } from '../../core/errors.js';
import type { AuthCredentialRepository, AuthUserRepository, DeviceFingerprintRepository, LoginAttemptRepository, PasswordResetRequestRepository, RefreshTokenRepository, SecurityEventRepository, SessionRepository, TwoFactorChallengeRepository } from './repositories.js';
import type { AuthSecurityPolicy, Clock, DeviceContext, DeviceFingerprint, LoginAttempt, LoginSession, PasswordResetRequestRecord, PasswordVerifier, SecretGenerator, SecurityEvent, SessionRefreshToken, TwoFactorChallenge } from './types.js';

type JsonValue = null | boolean | number | string | JsonValue[] | { readonly [key: string]: JsonValue };

function iso(date: Date): string { return date.toISOString(); }
function addMs(date: Date, ttlMs: number): string { return new Date(date.getTime() + ttlMs).toISOString(); }
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
function freezeMetadata(metadata?: Record<string, unknown>): Readonly<Record<string, JsonValue>> {
  return deepFreeze({ ...(metadata ?? {}) }) as Readonly<Record<string, JsonValue>>;
}
function requireNonBlank(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new ValidationError(`Le champ ${fieldName} est obligatoire`);
  return trimmed;
}
function assertPositiveMs(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new ValidationError(`Le paramètre ${fieldName} doit être configuré avec une durée positive`);
}
function validatePolicy(policy: AuthSecurityPolicy): void {
  assertPositiveMs(policy.accessTokenTtlMs, 'accessTokenTtlMs');
  assertPositiveMs(policy.refreshTokenTtlMs, 'refreshTokenTtlMs');
  assertPositiveMs(policy.sessionAbsoluteTtlMs, 'sessionAbsoluteTtlMs');
  if (policy.sessionIdleTtlMs !== null) assertPositiveMs(policy.sessionIdleTtlMs, 'sessionIdleTtlMs');
  assertPositiveMs(policy.passwordResetTokenTtlMs, 'passwordResetTokenTtlMs');
  assertPositiveMs(policy.twoFactorChallengeTtlMs, 'twoFactorChallengeTtlMs');
  assertPositiveMs(policy.blockDurationMs, 'blockDurationMs');
  if (!Number.isInteger(policy.twoFactorMaxAttempts) || policy.twoFactorMaxAttempts <= 0) throw new ValidationError('Le nombre maximal de tentatives 2FA doit être configuré avec un entier positif');
  if (!Number.isInteger(policy.loginBlockThreshold) || policy.loginBlockThreshold <= 0) throw new ValidationError('Le seuil de blocage doit être configuré avec un entier positif');
}

export class SecurityEventService {
  constructor(private readonly dependencies: { repository: SecurityEventRepository; clock: Clock }) {}

  async record(input: { userId?: string | null; actorUserId?: string | null; eventType: string; severity: SecurityEvent['severity']; relatedEntityType?: string | null; relatedEntityId?: string | null; metadata?: Record<string, unknown> }): Promise<SecurityEvent> {
    const event: SecurityEvent = Object.freeze({
      id: randomUUID(),
      userId: input.userId ?? null,
      actorUserId: input.actorUserId ?? null,
      eventType: requireNonBlank(input.eventType, 'eventType'),
      severity: input.severity,
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId: input.relatedEntityId ?? null,
      occurredAt: iso(this.dependencies.clock.now()),
      metadata: freezeMetadata(input.metadata),
    });
    return this.dependencies.repository.record(event);
  }

  listByUserId(userId: string): Promise<readonly SecurityEvent[]> {
    return this.dependencies.repository.listByUserId(requireNonBlank(userId, 'userId'));
  }
}

export class SessionService {
  constructor(private readonly dependencies: { repository: SessionRepository; clock: Clock; policy: AuthSecurityPolicy; securityEvents: SecurityEventService }) { validatePolicy(dependencies.policy); }

  async create(input: { userId: string; deviceFingerprintId?: string | null; metadata?: Record<string, unknown> }): Promise<LoginSession> {
    const now = this.dependencies.clock.now();
    const session: LoginSession = Object.freeze({
      id: randomUUID(), userId: requireNonBlank(input.userId, 'userId'), deviceFingerprintId: input.deviceFingerprintId ?? null, status: 'active', issuedAt: iso(now), expiresAt: addMs(now, this.dependencies.policy.sessionAbsoluteTtlMs), idleExpiresAt: this.dependencies.policy.sessionIdleTtlMs === null ? null : addMs(now, this.dependencies.policy.sessionIdleTtlMs), lastSeenAt: iso(now), revokedAt: null, revokedByUserId: null, revocationReason: null, metadata: freezeMetadata(input.metadata),
    });
    const saved = await this.dependencies.repository.save(session);
    await this.dependencies.securityEvents.record({ userId: saved.userId, eventType: 'session.created', severity: 'info', relatedEntityType: 'login_session', relatedEntityId: saved.id });
    return saved;
  }

  async assertActive(sessionId: string): Promise<LoginSession> {
    const session = await this.dependencies.repository.findById(requireNonBlank(sessionId, 'sessionId'));
    if (session === null) throw new ForbiddenError('Session introuvable');
    const now = this.dependencies.clock.now().getTime();
    const expired = session.status !== 'active' || Date.parse(session.expiresAt) <= now || (session.idleExpiresAt !== null && Date.parse(session.idleExpiresAt) <= now);
    if (expired) throw new ForbiddenError('Session inactive ou expirée');
    return session;
  }

  async revoke(input: { session: LoginSession; actorUserId: string | null; reason: string }): Promise<LoginSession> {
    const now = iso(this.dependencies.clock.now());
    const revoked = Object.freeze({ ...input.session, status: 'revoked' as const, revokedAt: now, revokedByUserId: input.actorUserId, revocationReason: requireNonBlank(input.reason, 'reason') });
    const saved = await this.dependencies.repository.save(revoked);
    await this.dependencies.securityEvents.record({ userId: saved.userId, actorUserId: input.actorUserId, eventType: 'session.revoked', severity: 'major', relatedEntityType: 'login_session', relatedEntityId: saved.id, metadata: { reason: saved.revocationReason } });
    return saved;
  }

  async revokeById(input: { sessionId: string; actorUserId: string | null; reason: string }): Promise<LoginSession | null> {
    const session = await this.dependencies.repository.findById(requireNonBlank(input.sessionId, 'sessionId'));
    if (session === null || session.status !== 'active') return session;
    return this.revoke({ session, actorUserId: input.actorUserId, reason: input.reason });
  }

  async revokeAllForUser(input: { userId: string; actorUserId: string | null; reason: string }): Promise<readonly LoginSession[]> {
    const sessions = await this.dependencies.repository.listActiveByUserId(requireNonBlank(input.userId, 'userId'));
    return Promise.all(sessions.map((session) => this.revoke({ session, actorUserId: input.actorUserId, reason: input.reason })));
  }

  async revokeAllForDevice(input: { deviceFingerprintId: string; actorUserId: string | null; reason: string }): Promise<readonly LoginSession[]> {
    const sessions = await this.dependencies.repository.listActiveByDeviceId(requireNonBlank(input.deviceFingerprintId, 'deviceFingerprintId'));
    return Promise.all(sessions.map((session) => this.revoke({ session, actorUserId: input.actorUserId, reason: input.reason })));
  }
}

export class DeviceFingerprintService {
  constructor(private readonly dependencies: { repository: DeviceFingerprintRepository; secretGenerator: SecretGenerator; clock: Clock; securityEvents: SecurityEventService; sessionService: SessionService }) {}

  async identify(input: { userId: string; device?: DeviceContext | null }): Promise<DeviceFingerprint | null> {
    const fingerprint = input.device?.fingerprint;
    if (fingerprint === undefined || fingerprint === null || fingerprint.trim().length === 0) return null;
    const now = iso(this.dependencies.clock.now());
    const userId = requireNonBlank(input.userId, 'userId');
    const fingerprintHash = this.dependencies.secretGenerator.hash(fingerprint);
    const existing = await this.dependencies.repository.findByUserIdAndHash({ userId, fingerprintHash });
    const device: DeviceFingerprint = existing === null ? Object.freeze({
      id: randomUUID(), userId, fingerprintHash, label: null, status: 'pending', firstSeenAt: now, lastSeenAt: now, revokedAt: null, revokedByUserId: null, metadata: freezeMetadata(input.device?.metadata),
    }) : Object.freeze({ ...existing, lastSeenAt: now, metadata: freezeMetadata({ ...existing.metadata, ...(input.device?.metadata ?? {}) }) });
    const saved = await this.dependencies.repository.save(device);
    await this.dependencies.securityEvents.record({ userId, eventType: existing === null ? 'device.created' : 'device.seen', severity: 'info', relatedEntityType: 'device_fingerprint', relatedEntityId: saved.id });
    return saved;
  }

  async revoke(input: { device: DeviceFingerprint; actorUserId: string; reason: string }): Promise<DeviceFingerprint> {
    const reason = requireNonBlank(input.reason, 'reason');
    const now = iso(this.dependencies.clock.now());
    const revoked = Object.freeze({ ...input.device, status: 'revoked' as const, revokedAt: now, revokedByUserId: requireNonBlank(input.actorUserId, 'actorUserId') });
    const saved = await this.dependencies.repository.save(revoked);
    await this.dependencies.sessionService.revokeAllForDevice({ deviceFingerprintId: saved.id, actorUserId: input.actorUserId, reason });
    await this.dependencies.securityEvents.record({ userId: saved.userId, actorUserId: input.actorUserId, eventType: 'device.revoked', severity: 'major', relatedEntityType: 'device_fingerprint', relatedEntityId: saved.id, metadata: { reason } });
    return saved;
  }
}

export class TwoFactorService {
  constructor(private readonly dependencies: { repository: TwoFactorChallengeRepository; secretGenerator: SecretGenerator; clock: Clock; policy: AuthSecurityPolicy; securityEvents: SecurityEventService; method?: string }) { validatePolicy(dependencies.policy); }

  async create(input: { userId: string; metadata?: Record<string, unknown> }): Promise<{ challenge: TwoFactorChallenge; verificationCode: string }> {
    const now = this.dependencies.clock.now();
    const verificationCode = this.dependencies.secretGenerator.generate();
    const challenge: TwoFactorChallenge = Object.freeze({
      id: randomUUID(),
      userId: requireNonBlank(input.userId, 'userId'),
      method: this.dependencies.method ?? 'configured',
      codeHash: this.dependencies.secretGenerator.hash(verificationCode),
      status: 'pending',
      attempts: 0,
      maxAttempts: this.dependencies.policy.twoFactorMaxAttempts,
      expiresAt: addMs(now, this.dependencies.policy.twoFactorChallengeTtlMs),
      verifiedAt: null,
      createdAt: iso(now),
      metadata: freezeMetadata(input.metadata),
    });
    const saved = await this.dependencies.repository.save(challenge);
    await this.dependencies.securityEvents.record({ userId: saved.userId, eventType: '2fa.challenge_created', severity: 'medium', relatedEntityType: 'two_factor_challenge', relatedEntityId: saved.id });
    return { challenge: saved, verificationCode };
  }

  async verify(input: { challengeId: string; code: string; metadata?: Record<string, unknown> }): Promise<TwoFactorChallenge> {
    const challenge = await this.dependencies.repository.findById(requireNonBlank(input.challengeId, 'challengeId'));
    if (challenge === null) throw new ForbiddenError('Challenge 2FA introuvable');
    const now = this.dependencies.clock.now();
    if (challenge.status !== 'pending') throw new ForbiddenError('Challenge 2FA inactif');
    if (Date.parse(challenge.expiresAt) <= now.getTime()) {
      const expired = Object.freeze({ ...challenge, status: 'expired' as const, metadata: freezeMetadata({ ...challenge.metadata, ...(input.metadata ?? {}) }) });
      const saved = await this.dependencies.repository.save(expired);
      await this.dependencies.securityEvents.record({ userId: challenge.userId, eventType: '2fa.expired', severity: 'medium', relatedEntityType: 'two_factor_challenge', relatedEntityId: challenge.id });
      throw new ForbiddenError('Challenge 2FA expiré');
    }
    const matches = challenge.codeHash === this.dependencies.secretGenerator.hash(requireNonBlank(input.code, 'code'));
    if (matches) {
      const succeeded = Object.freeze({ ...challenge, status: 'succeeded' as const, verifiedAt: iso(now), metadata: freezeMetadata({ ...challenge.metadata, ...(input.metadata ?? {}) }) });
      const saved = await this.dependencies.repository.save(succeeded);
      await this.dependencies.securityEvents.record({ userId: challenge.userId, eventType: '2fa.succeeded', severity: 'info', relatedEntityType: 'two_factor_challenge', relatedEntityId: saved.id });
      return saved;
    }
    const attempts = challenge.attempts + 1;
    const failed = Object.freeze({ ...challenge, attempts, status: attempts >= challenge.maxAttempts ? 'failed' as const : 'pending' as const, metadata: freezeMetadata({ ...challenge.metadata, ...(input.metadata ?? {}) }) });
    const saved = await this.dependencies.repository.save(failed);
    await this.dependencies.securityEvents.record({ userId: challenge.userId, eventType: attempts >= challenge.maxAttempts ? '2fa.failed' : '2fa.attempt_failed', severity: attempts >= challenge.maxAttempts ? 'major' : 'medium', relatedEntityType: 'two_factor_challenge', relatedEntityId: saved.id });
    throw new ForbiddenError('Code 2FA invalide');
  }
}

export class RefreshTokenService {
  constructor(private readonly dependencies: { repository: RefreshTokenRepository; sessionService: SessionService; secretGenerator: SecretGenerator; clock: Clock; policy: AuthSecurityPolicy; securityEvents: SecurityEventService }) { validatePolicy(dependencies.policy); }

  async issue(input: { sessionId: string; metadata?: Record<string, unknown> }): Promise<{ refreshToken: string; record: SessionRefreshToken }> {
    const token = this.dependencies.secretGenerator.generate();
    const record = await this.makeRecord({ refreshToken: token, sessionId: input.sessionId, metadata: input.metadata });
    return { refreshToken: token, record: await this.dependencies.repository.save(record) };
  }

  async rotate(input: { refreshToken: string }): Promise<{ refreshToken: string; record: SessionRefreshToken; previous: SessionRefreshToken; session: LoginSession }> {
    const tokenHash = this.dependencies.secretGenerator.hash(requireNonBlank(input.refreshToken, 'refreshToken'));
    const existing = await this.dependencies.repository.findByHash(tokenHash);
    if (existing === null) throw new ForbiddenError('Refresh token invalide');
    const now = this.dependencies.clock.now();
    if (existing.status !== 'active') {
      const reused = await this.dependencies.repository.markReused({ tokenHash, reusedAt: iso(now) }) ?? existing;
      await this.applyReusePolicy(reused);
      throw new ForbiddenError('Refresh token réutilisé');
    }
    if (Date.parse(existing.expiresAt) <= now.getTime()) {
      const expired = Object.freeze({ ...existing, status: 'expired' as const, revokedAt: iso(now) });
      await this.dependencies.repository.save(expired);
      throw new ForbiddenError('Refresh token expiré');
    }
    const session = await this.dependencies.sessionService.assertActive(existing.sessionId);
    const nextRefreshToken = this.dependencies.secretGenerator.generate();
    const nextToken = await this.makeRecord({ refreshToken: nextRefreshToken, sessionId: session.id });
    const rotated = await this.dependencies.repository.rotateActive({ tokenHash, rotatedAt: iso(now), nextToken });
    if (rotated === null) {
      const reused = await this.dependencies.repository.markReused({ tokenHash, reusedAt: iso(now) }) ?? existing;
      await this.applyReusePolicy(reused);
      throw new ForbiddenError('Refresh token réutilisé');
    }
    await this.dependencies.securityEvents.record({ userId: session.userId, eventType: 'refresh_token.rotated', severity: 'info', relatedEntityType: 'session_refresh_token', relatedEntityId: rotated.previous.id });
    return { refreshToken: nextRefreshToken, record: rotated.next, previous: rotated.previous, session };
  }

  private async makeRecord(input: { refreshToken: string; sessionId: string; metadata?: Record<string, unknown> }): Promise<SessionRefreshToken> {
    const now = this.dependencies.clock.now();
    return Object.freeze({ id: randomUUID(), sessionId: requireNonBlank(input.sessionId, 'sessionId'), tokenHash: this.dependencies.secretGenerator.hash(input.refreshToken), status: 'active', issuedAt: iso(now), expiresAt: addMs(now, this.dependencies.policy.refreshTokenTtlMs), rotatedAt: null, revokedAt: null, replacedByTokenId: null, metadata: freezeMetadata(input.metadata) });
  }

  private async applyReusePolicy(token: SessionRefreshToken): Promise<void> {
    await this.dependencies.securityEvents.record({ eventType: 'refresh_token.reused', severity: 'critical', relatedEntityType: 'session_refresh_token', relatedEntityId: token.id });
    if (this.dependencies.policy.refreshTokenReuseAction === 'record_only') return;
    const session = await this.dependencies.sessionService.revokeById({ sessionId: token.sessionId, actorUserId: null, reason: 'refresh_token_reuse' });
    if (this.dependencies.policy.refreshTokenReuseAction === 'revoke_user_sessions' && session !== null) {
      await this.dependencies.sessionService.revokeAllForUser({ userId: session.userId, actorUserId: null, reason: 'refresh_token_reuse' });
    }
  }
}

export class PasswordResetService {
  constructor(private readonly dependencies: { repository: PasswordResetRequestRepository; userRepository: AuthUserRepository; credentialRepository: AuthCredentialRepository; sessionService: SessionService; secretGenerator: SecretGenerator; clock: Clock; policy: AuthSecurityPolicy; securityEvents: SecurityEventService }) { validatePolicy(dependencies.policy); }

  async request(input: { identifier: string; metadata?: Record<string, unknown> }): Promise<{ accepted: true }> {
    const identifier = requireNonBlank(input.identifier, 'identifier');
    const user = await this.dependencies.userRepository.findByIdentifier(identifier);
    const token = this.dependencies.secretGenerator.generate();
    const now = this.dependencies.clock.now();
    const record: PasswordResetRequestRecord = Object.freeze({ id: randomUUID(), userId: user?.id ?? null, identifierHash: this.dependencies.secretGenerator.hash(identifier), tokenHash: this.dependencies.secretGenerator.hash(token), status: 'pending', expiresAt: addMs(now, this.dependencies.policy.passwordResetTokenTtlMs), completedAt: null, createdAt: iso(now), metadata: freezeMetadata(input.metadata) });
    const saved = await this.dependencies.repository.save(record);
    await this.dependencies.securityEvents.record({ userId: user?.id ?? null, eventType: 'password_reset.requested', severity: 'medium', relatedEntityType: 'password_reset_request', relatedEntityId: saved.id });
    return { accepted: true };
  }

  async confirm(input: { resetToken: string; newCredentialHash: string; metadata?: Record<string, unknown> }): Promise<PasswordResetRequestRecord> {
    const tokenHash = this.dependencies.secretGenerator.hash(requireNonBlank(input.resetToken, 'resetToken'));
    const request = await this.dependencies.repository.findByTokenHash(tokenHash);
    if (request === null || request.status !== 'pending' || Date.parse(request.expiresAt) <= this.dependencies.clock.now().getTime() || request.userId === null) throw new ForbiddenError('Demande de réinitialisation invalide');
    await this.dependencies.credentialRepository.replacePasswordCredential({ userId: request.userId, credentialHash: requireNonBlank(input.newCredentialHash, 'newCredentialHash'), changedAt: iso(this.dependencies.clock.now()), metadata: input.metadata });
    await this.dependencies.sessionService.revokeAllForUser({ userId: request.userId, actorUserId: request.userId, reason: 'password_reset' });
    const completed = Object.freeze({ ...request, status: 'completed' as const, completedAt: iso(this.dependencies.clock.now()) });
    const saved = await this.dependencies.repository.save(completed);
    await this.dependencies.securityEvents.record({ userId: request.userId, eventType: 'password_reset.completed', severity: 'major', relatedEntityType: 'password_reset_request', relatedEntityId: saved.id });
    return saved;
  }
}

export class AuthService {
  constructor(private readonly dependencies: { userRepository: AuthUserRepository; credentialRepository: AuthCredentialRepository; loginAttemptRepository: LoginAttemptRepository; deviceFingerprintService: DeviceFingerprintService; sessionService: SessionService; refreshTokenService: RefreshTokenService; twoFactorService: TwoFactorService; securityEvents: SecurityEventService; passwordVerifier: PasswordVerifier; secretGenerator: SecretGenerator; clock: Clock; policy: AuthSecurityPolicy }) { validatePolicy(dependencies.policy); }

  async login(input: { identifier: string; password: string; device?: DeviceContext | null; metadata?: Record<string, unknown> }): Promise<{ accessToken: string | null; refreshToken: string | null; requiresTwoFactor: boolean; session: LoginSession | null; challenge: TwoFactorChallenge | null }> {
    const identifier = requireNonBlank(input.identifier, 'identifier');
    const identifierHash = this.dependencies.secretGenerator.hash(identifier);
    const ipAddressHash = input.device?.ipAddress === undefined || input.device.ipAddress === null || input.device.ipAddress.trim().length === 0 ? null : this.dependencies.secretGenerator.hash(input.device.ipAddress);
    const now = this.dependencies.clock.now();
    const failures = await this.dependencies.loginAttemptRepository.countRecentFailures({ identifierHash, since: addMs(now, -this.dependencies.policy.blockDurationMs), now: iso(now) });
    if (failures >= this.dependencies.policy.loginBlockThreshold) {
      await this.recordAttempt({ identifierHash, ipAddressHash, outcome: 'blocked', failureReason: 'threshold_reached', metadata: input.metadata });
      throw new ForbiddenError('Authentification temporairement bloquée');
    }
    const user = await this.dependencies.userRepository.findByIdentifier(identifier);
    const credential = user === null ? null : await this.dependencies.credentialRepository.findActivePasswordCredentialByUserId(user.id);
    const passwordOk = credential !== null && credential.status === 'active' && this.dependencies.passwordVerifier.verify({ password: input.password, credentialHash: credential.credentialHash });
    if (user === null || user.status !== 'active' || !passwordOk) {
      await this.recordAttempt({ userId: user?.id ?? null, identifierHash, ipAddressHash, outcome: 'failed', failureReason: 'invalid_credentials', metadata: input.metadata });
      await this.dependencies.securityEvents.record({ userId: user?.id ?? null, eventType: 'auth.login_failed', severity: 'medium' });
      throw new ForbiddenError('Identifiants invalides');
    }
    const device = await this.dependencies.deviceFingerprintService.identify({ userId: user.id, device: input.device });
    if (device?.status === 'revoked') {
      await this.recordAttempt({ userId: user.id, identifierHash, deviceFingerprintId: device.id, ipAddressHash, outcome: 'blocked', failureReason: 'device_revoked', metadata: input.metadata });
      await this.dependencies.securityEvents.record({ userId: user.id, eventType: 'auth.device_revoked', severity: 'major', relatedEntityType: 'device_fingerprint', relatedEntityId: device.id });
      throw new ForbiddenError('Appareil révoqué');
    }
    await this.recordAttempt({ userId: user.id, identifierHash, deviceFingerprintId: device?.id ?? null, ipAddressHash, outcome: 'succeeded', failureReason: null, metadata: input.metadata });
    if (this.dependencies.policy.requireTwoFactor) {
      const twoFactor = await this.dependencies.twoFactorService.create({ userId: user.id, metadata: input.metadata });
      await this.dependencies.securityEvents.record({ userId: user.id, eventType: 'auth.two_factor_required', severity: 'medium', relatedEntityType: 'two_factor_challenge', relatedEntityId: twoFactor.challenge.id });
      return { accessToken: null, refreshToken: null, requiresTwoFactor: true, session: null, challenge: twoFactor.challenge };
    }
    const session = await this.dependencies.sessionService.create({ userId: user.id, deviceFingerprintId: device?.id ?? null, metadata: input.metadata });
    const refresh = await this.dependencies.refreshTokenService.issue({ sessionId: session.id });
    await this.dependencies.securityEvents.record({ userId: user.id, eventType: 'auth.login_succeeded', severity: 'info', relatedEntityType: 'login_session', relatedEntityId: session.id });
    return { accessToken: this.dependencies.secretGenerator.generate(), refreshToken: refresh.refreshToken, requiresTwoFactor: false, session, challenge: null };
  }

  private async recordAttempt(input: { userId?: string | null; identifierHash: string; deviceFingerprintId?: string | null; ipAddressHash?: string | null; outcome: LoginAttempt['outcome']; failureReason: string | null; metadata?: Record<string, unknown> }): Promise<LoginAttempt> {
    const attempt: LoginAttempt = Object.freeze({ id: randomUUID(), userId: input.userId ?? null, identifierHash: input.identifierHash, deviceFingerprintId: input.deviceFingerprintId ?? null, ipAddressHash: input.ipAddressHash ?? null, outcome: input.outcome, failureReason: input.failureReason, occurredAt: iso(this.dependencies.clock.now()), metadata: freezeMetadata(input.metadata) });
    return this.dependencies.loginAttemptRepository.record(attempt);
  }
}
