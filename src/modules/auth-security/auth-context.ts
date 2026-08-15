import { ForbiddenError, ValidationError } from '../../core/errors.js';
import { AccessTokenService } from './access-token.js';
import { AuthService, DeviceFingerprintService, RefreshTokenService, SecurityEventService, SessionService, TwoFactorService } from './services.js';
import { HashPasswordVerifier, InMemoryAuthCredentialRepository, InMemoryAuthUserRepository, InMemoryDeviceFingerprintRepository, InMemoryLoginAttemptRepository, InMemoryPasswordResetRequestRepository, InMemoryRefreshTokenRepository, InMemorySecurityEventRepository, InMemorySessionRepository, InMemoryTwoFactorChallengeRepository, NodeSecretGenerator, SystemClock } from './in-memory.js';
import type { AuthCredential, AuthenticatedUser, AuthSecurityPolicy, DeviceContext, LoginSession } from './types.js';
import { defaultAuthSecurityPolicy } from './policy.js';
import { isRole, type Role } from '../rbac/permissions.js';

export interface AuthenticatedActorSession {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: string;
  readonly idleExpiresAt: string | null;
}

export interface AuthenticatedLoginResult {
  readonly accessToken: string | null;
  readonly refreshToken: string | null;
  readonly requiresTwoFactor: boolean;
  readonly session: AuthenticatedActorSession | null;
  readonly challenge: { readonly id: string; readonly method: string; readonly expiresAt: string; readonly status: string } | null;
}

export interface AuthenticatedActor {
  readonly id: string;
  readonly role: Role;
  readonly sessionId: string;
}

export interface AuthRuntimeOptions {
  readonly jwtSecret?: string;
  readonly bootstrapPassword?: string;
  readonly policy?: Partial<AuthSecurityPolicy>;
}

function configuredSecret(input: string | undefined, environmentName: string, label: string): string {
  const value = input ?? process.env[environmentName];
  if (value === undefined || value.trim().length === 0) throw new ValidationError(`Le paramètre ${label} doit être fourni par configuration`);
  return value;
}

function roleFromMetadata(user: AuthenticatedUser): Role {
  const role = user.metadata.role;
  if (isRole(role)) return role;
  throw new ForbiddenError('Rôle utilisateur invalide');
}

function toSessionResponse(session: LoginSession): AuthenticatedActorSession {
  return Object.freeze({ id: session.id, userId: session.userId, expiresAt: session.expiresAt, idleExpiresAt: session.idleExpiresAt });
}

export class AuthRuntimeContext {
  readonly clock = new SystemClock();
  readonly secrets = new NodeSecretGenerator();
  readonly userRepository: InMemoryAuthUserRepository;
  readonly credentialRepository: InMemoryAuthCredentialRepository;
  readonly loginAttemptRepository = new InMemoryLoginAttemptRepository();
  readonly deviceFingerprintRepository = new InMemoryDeviceFingerprintRepository();
  readonly sessionRepository = new InMemorySessionRepository();
  readonly refreshTokenRepository = new InMemoryRefreshTokenRepository();
  readonly passwordResetRequestRepository = new InMemoryPasswordResetRequestRepository();
  readonly twoFactorChallengeRepository = new InMemoryTwoFactorChallengeRepository();
  readonly securityEventRepository = new InMemorySecurityEventRepository();
  readonly securityEvents: SecurityEventService;
  readonly sessionService: SessionService;
  readonly refreshTokenService: RefreshTokenService;
  readonly twoFactorService: TwoFactorService;
  readonly deviceFingerprintService: DeviceFingerprintService;
  readonly authService: AuthService;
  readonly accessTokens: AccessTokenService;
  readonly policy: AuthSecurityPolicy;

  constructor(options: AuthRuntimeOptions = {}) {
    this.policy = Object.freeze({ ...defaultAuthSecurityPolicy, ...(options.policy ?? {}) });
    const bootstrapPassword = configuredSecret(options.bootstrapPassword, 'HOPEHOUSE_BOOTSTRAP_PASSWORD', 'bootstrapPassword');
    const bootstrapUser: AuthenticatedUser = Object.freeze({ id: 'bootstrap-system-admin', identifier: 'admin@hopehouse.local', status: 'active', metadata: Object.freeze({ role: 'system_admin' }) });
    const bootstrapCredential: AuthCredential = Object.freeze({ id: 'bootstrap-credential', userId: bootstrapUser.id, credentialType: 'password', credentialHash: this.secrets.hash(bootstrapPassword), status: 'active', lastChangedAt: this.clock.now().toISOString(), mustRotateAt: null, metadata: Object.freeze({ bootstrap: true }) });
    this.userRepository = new InMemoryAuthUserRepository([bootstrapUser]);
    this.credentialRepository = new InMemoryAuthCredentialRepository([bootstrapCredential]);
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
    const user = await this.userRepository.findById(result.session.userId);
    if (user === null) throw new ForbiddenError('Utilisateur introuvable');
    return Object.freeze({
      accessToken: this.accessTokens.issue({ userId: user.id, sessionId: result.session.id, role: roleFromMetadata(user) }),
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
    const user = await this.userRepository.findById(claims.sub);
    if (user === null || user.status !== 'active') throw new ForbiddenError('Utilisateur inactif');
    return Object.freeze({ id: user.id, role: roleFromMetadata(user), sessionId: session.id });
  }
}
