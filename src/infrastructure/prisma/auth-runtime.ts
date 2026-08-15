import { createHash, randomBytes } from 'node:crypto';
import { ForbiddenError, ValidationError } from '../../core/errors.js';
import { AccessTokenService } from '../../modules/auth-security/access-token.js';
import { AuthService, DeviceFingerprintService, RefreshTokenService, SecurityEventService, SessionService, TwoFactorService } from '../../modules/auth-security/services.js';
import type { AuthenticatedActor, AuthenticatedActorSession, AuthenticatedLoginResult, AuthRuntimeOptions } from '../../modules/auth-security/auth-context.js';
import { normalizeAuthSecurityPolicy, resolveAuthSecurityPolicy } from '../../modules/auth-security/policy.js';
import type { AuthSecurityPolicy, Clock, DeviceContext, LoginSession, PasswordVerifier, SecretGenerator } from '../../modules/auth-security/types.js';
import { ConfigurationService } from '../../modules/configuration/index.js';
import type { Role } from '../../modules/rbac/permissions.js';
import { PrismaAppSettingRepository, type PrismaAppSettingClient } from './app-setting-repository.js';
import { PrismaAuthCredentialRepository, type PrismaAuthCredentialClient } from './auth-credential-repository.js';
import { PrismaAuthUserRepository, type PrismaAuthUserClient } from './auth-user-repository.js';
import { createPrismaClient, type CreatePrismaClientOptions, type PrismaClientLifecycle } from './client.js';
import { PrismaDeviceFingerprintRepository, type PrismaDeviceFingerprintClient } from './device-fingerprint-repository.js';
import { PrismaLoginAttemptRepository, type PrismaLoginAttemptClient } from './login-attempt-repository.js';
import { PrismaPasswordResetRequestRepository, type PrismaPasswordResetRequestClient } from './password-reset-request-repository.js';
import { PrismaRefreshTokenRepository, type PrismaRefreshTokenClient } from './refresh-token-repository.js';
import { PrismaSecurityEventRepository, type PrismaSecurityEventClient } from './security-event-repository.js';
import { PrismaSessionRepository, type PrismaSessionClient } from './session-repository.js';
import { PrismaTwoFactorChallengeRepository, type PrismaTwoFactorChallengeClient } from './two-factor-challenge-repository.js';

type PrismaAuthRuntimeUserRecord = {
  readonly id: string;
  readonly email: string;
  readonly status: 'active' | 'inactive' | 'suspended' | 'archived';
  readonly roleId: string;
};

type PrismaAuthRuntimeUserDelegate = {
  findUnique(input: { readonly where: { readonly id: string } }): Promise<PrismaAuthRuntimeUserRecord | null>;
};

type PrismaAuthCredentialTransaction = Parameters<PrismaAuthCredentialClient['$transaction']>[0] extends (transaction: infer TTransaction) => Promise<unknown> ? TTransaction : never;
type PrismaRefreshTokenTransaction = Parameters<PrismaRefreshTokenClient['$transaction']>[0] extends (transaction: infer TTransaction) => Promise<unknown> ? TTransaction : never;

export interface PrismaAuthRuntimeClient extends PrismaClientLifecycle, PrismaAppSettingClient, PrismaAuthUserClient, Omit<PrismaAuthCredentialClient, '$transaction'>, PrismaDeviceFingerprintClient, PrismaLoginAttemptClient, PrismaPasswordResetRequestClient, Omit<PrismaRefreshTokenClient, '$transaction'>, PrismaSecurityEventClient, PrismaSessionClient, PrismaTwoFactorChallengeClient {
  readonly user: PrismaAuthUserClient['user'] & PrismaAuthRuntimeUserDelegate;
  $transaction<T>(operation: (transaction: PrismaAuthCredentialTransaction) => Promise<T>): Promise<T>;
  $transaction<T>(operation: (transaction: PrismaRefreshTokenTransaction) => Promise<T>): Promise<T>;
}

export interface PrismaAuthRuntimeOptions extends AuthRuntimeOptions {
  readonly databaseUrl?: string;
  readonly prisma?: CreatePrismaClientOptions<PrismaAuthRuntimeClient>;
}

function configuredSecret(input: string | undefined, environmentName: string, label: string): string {
  const value = input ?? process.env[environmentName];
  if (value === undefined || value.trim().length === 0) throw new ValidationError(`Le paramètre ${label} doit être fourni par configuration`);
  return value;
}

function roleFromRecord(user: PrismaAuthRuntimeUserRecord): Role {
  const role = user.roleId;
  if (role === 'system_admin' || role === 'business_admin' || role === 'operations_agent' || role === 'finance_manager' || role === 'client' || role === 'accountant' || role === 'auditor') return role;
  throw new ForbiddenError('Rôle utilisateur invalide');
}

function toSessionResponse(session: LoginSession): AuthenticatedActorSession {
  return Object.freeze({ id: session.id, userId: session.userId, expiresAt: session.expiresAt, idleExpiresAt: session.idleExpiresAt });
}

class SystemClock implements Clock {
  now(): Date { return new Date(); }
}


function hasAppSettingClient(client: PrismaAuthRuntimeClient): boolean {
  return typeof (client as { readonly appSetting?: unknown }).appSetting === 'object' && (client as { readonly appSetting?: unknown }).appSetting !== null;
}

export async function resolvePrismaAuthSecurityPolicy(client: PrismaAuthRuntimeClient, fallback?: Partial<AuthSecurityPolicy>): Promise<AuthSecurityPolicy> {
  const safeFallback = normalizeAuthSecurityPolicy(fallback);
  if (!hasAppSettingClient(client)) return safeFallback;
  const configuration = new ConfigurationService({ repository: new PrismaAppSettingRepository(client), clock: new SystemClock() });
  return resolveAuthSecurityPolicy({ configuration, fallback: safeFallback });
}

class NodeSecretGenerator implements SecretGenerator {
  generate(): string { return randomBytes(32).toString('base64url'); }
  hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
}

class HashPasswordVerifier implements PasswordVerifier {
  constructor(private readonly secrets: SecretGenerator) {}
  verify(input: { password: string; credentialHash: string }): boolean { return this.secrets.hash(input.password) === input.credentialHash; }
}

export class PrismaAuthRuntimeContext {
  readonly clock = new SystemClock();
  readonly secrets = new NodeSecretGenerator();
  readonly userRepository: PrismaAuthUserRepository;
  readonly credentialRepository: PrismaAuthCredentialRepository;
  readonly loginAttemptRepository: PrismaLoginAttemptRepository;
  readonly deviceFingerprintRepository: PrismaDeviceFingerprintRepository;
  readonly sessionRepository: PrismaSessionRepository;
  readonly refreshTokenRepository: PrismaRefreshTokenRepository;
  readonly passwordResetRequestRepository: PrismaPasswordResetRequestRepository;
  readonly twoFactorChallengeRepository: PrismaTwoFactorChallengeRepository;
  readonly securityEventRepository: PrismaSecurityEventRepository;
  readonly securityEvents: SecurityEventService;
  readonly sessionService: SessionService;
  readonly refreshTokenService: RefreshTokenService;
  readonly twoFactorService: TwoFactorService;
  readonly deviceFingerprintService: DeviceFingerprintService;
  readonly authService: AuthService;
  readonly accessTokens: AccessTokenService;
  readonly policy: AuthSecurityPolicy;

  static async create(options: PrismaAuthRuntimeOptions = {}): Promise<PrismaAuthRuntimeContext> {
    const client = await createPrismaClient<PrismaAuthRuntimeClient>({ ...(options.prisma ?? {}), databaseUrl: options.databaseUrl ?? options.prisma?.databaseUrl });
    const policy = await resolvePrismaAuthSecurityPolicy(client, options.policy);
    return new PrismaAuthRuntimeContext(client, { ...options, policy });
  }

  constructor(private readonly client: PrismaAuthRuntimeClient, options: AuthRuntimeOptions = {}) {
    this.policy = normalizeAuthSecurityPolicy(options.policy);
    this.userRepository = new PrismaAuthUserRepository(client);
    this.credentialRepository = new PrismaAuthCredentialRepository(client);
    this.loginAttemptRepository = new PrismaLoginAttemptRepository(client);
    this.deviceFingerprintRepository = new PrismaDeviceFingerprintRepository(client);
    this.sessionRepository = new PrismaSessionRepository(client);
    this.refreshTokenRepository = new PrismaRefreshTokenRepository(client);
    this.passwordResetRequestRepository = new PrismaPasswordResetRequestRepository(client);
    this.twoFactorChallengeRepository = new PrismaTwoFactorChallengeRepository(client);
    this.securityEventRepository = new PrismaSecurityEventRepository(client);
    this.securityEvents = new SecurityEventService({ repository: this.securityEventRepository, clock: this.clock });
    this.sessionService = new SessionService({ repository: this.sessionRepository, clock: this.clock, policy: this.policy, securityEvents: this.securityEvents });
    this.refreshTokenService = new RefreshTokenService({ repository: this.refreshTokenRepository, sessionService: this.sessionService, secretGenerator: this.secrets, clock: this.clock, policy: this.policy, securityEvents: this.securityEvents });
    this.twoFactorService = new TwoFactorService({ repository: this.twoFactorChallengeRepository, secretGenerator: this.secrets, clock: this.clock, policy: this.policy, securityEvents: this.securityEvents });
    this.deviceFingerprintService = new DeviceFingerprintService({ repository: this.deviceFingerprintRepository, secretGenerator: this.secrets, clock: this.clock, securityEvents: this.securityEvents, sessionService: this.sessionService });
    this.authService = new AuthService({
      userRepository: this.userRepository,
      credentialRepository: this.credentialRepository,
      loginAttemptRepository: this.loginAttemptRepository,
      deviceFingerprintService: this.deviceFingerprintService,
      sessionService: this.sessionService,
      refreshTokenService: this.refreshTokenService,
      twoFactorService: this.twoFactorService,
      securityEvents: this.securityEvents,
      passwordVerifier: new HashPasswordVerifier(this.secrets),
      secretGenerator: this.secrets,
      clock: this.clock,
      policy: this.policy,
    });
    this.accessTokens = new AccessTokenService({ secret: configuredSecret(options.jwtSecret, 'HOPEHOUSE_JWT_SECRET', 'jwtSecret'), issuer: 'hopehouse-platform', audience: 'hopehouse-api', ttlMs: this.policy.accessTokenTtlMs, clock: this.clock });
  }

  async login(input: { identifier: string; password: string; device?: DeviceContext | null; metadata?: Record<string, unknown> }): Promise<AuthenticatedLoginResult> {
    const result = await this.authService.login(input);
    if (result.session === null) {
      return Object.freeze({ accessToken: null, refreshToken: null, requiresTwoFactor: result.requiresTwoFactor, session: null, challenge: result.challenge === null ? null : Object.freeze({ id: result.challenge.id, method: result.challenge.method, expiresAt: result.challenge.expiresAt, status: result.challenge.status }) });
    }
    const user = await this.client.user.findUnique({ where: { id: result.session.userId } });
    if (user === null) throw new ForbiddenError('Utilisateur introuvable');
    return Object.freeze({
      accessToken: this.accessTokens.issue({ userId: user.id, sessionId: result.session.id, role: roleFromRecord(user) }),
      refreshToken: result.refreshToken,
      requiresTwoFactor: false,
      session: toSessionResponse(result.session),
      challenge: null,
    });
  }

  async authenticateAccessToken(token: string): Promise<AuthenticatedActor> {
    const claims = this.accessTokens.verify(token);
    const session = await this.sessionService.assertActive(claims.sid);
    if (session.userId !== claims.sub) throw new ForbiddenError('Access token invalide');
    const user = await this.client.user.findUnique({ where: { id: claims.sub } });
    if (user === null || user.status !== 'active') throw new ForbiddenError('Utilisateur inactif');
    return Object.freeze({ id: user.id, role: roleFromRecord(user), sessionId: session.id });
  }
}
