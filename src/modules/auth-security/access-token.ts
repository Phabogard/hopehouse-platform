import { createHmac, timingSafeEqual } from 'node:crypto';
import { ForbiddenError, ValidationError } from '../../core/errors.js';
import type { Clock } from './types.js';

export interface AccessTokenClaims {
  readonly sub: string;
  readonly sid: string;
  readonly role: string;
  readonly iat: number;
  readonly exp: number;
  readonly iss: string;
  readonly aud: string;
}

export interface AccessTokenServiceOptions {
  readonly secret: string;
  readonly issuer: string;
  readonly audience: string;
  readonly ttlMs: number;
  readonly clock: Clock;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(input: string, secret: string): string {
  return createHmac('sha256', secret).update(input).digest('base64url');
}

function assertNonBlank(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new ValidationError(`Le paramètre ${fieldName} est obligatoire`);
  return trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringClaim(payload: Record<string, unknown>, claim: string): string {
  const value = payload[claim];
  if (typeof value !== 'string' || value.trim().length === 0) throw new ForbiddenError('Access token invalide');
  return value;
}

function numberClaim(payload: Record<string, unknown>, claim: string): number {
  const value = payload[claim];
  if (!Number.isInteger(value)) throw new ForbiddenError('Access token invalide');
  return Number(value);
}

export class AccessTokenService {
  private readonly secret: string;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly ttlMs: number;

  constructor(private readonly options: AccessTokenServiceOptions) {
    this.secret = assertNonBlank(options.secret, 'secret');
    this.issuer = assertNonBlank(options.issuer, 'issuer');
    this.audience = assertNonBlank(options.audience, 'audience');
    if (!Number.isInteger(options.ttlMs) || options.ttlMs <= 0) throw new ValidationError('Le TTL access token doit être positif');
    this.ttlMs = options.ttlMs;
  }

  issue(input: { userId: string; sessionId: string; role: string }): string {
    const issuedAtSeconds = Math.floor(this.options.clock.now().getTime() / 1000);
    const expiresAtSeconds = Math.floor((this.options.clock.now().getTime() + this.ttlMs) / 1000);
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload: AccessTokenClaims = {
      sub: assertNonBlank(input.userId, 'userId'),
      sid: assertNonBlank(input.sessionId, 'sessionId'),
      role: assertNonBlank(input.role, 'role'),
      iat: issuedAtSeconds,
      exp: expiresAtSeconds,
      iss: this.issuer,
      aud: this.audience,
    };
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    return `${signingInput}.${sign(signingInput, this.secret)}`;
  }

  verify(token: string): AccessTokenClaims {
    const tokenValue = assertNonBlank(token, 'token');
    const parts = tokenValue.split('.');
    if (parts.length !== 3) throw new ForbiddenError('Access token invalide');
    const [encodedHeader, encodedPayload, signature] = parts as [string, string, string];
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = sign(signingInput, this.secret);
    const provided = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw new ForbiddenError('Access token invalide');

    let header: unknown;
    let payload: unknown;
    try {
      header = JSON.parse(base64UrlDecode(encodedHeader));
      payload = JSON.parse(base64UrlDecode(encodedPayload));
    } catch {
      throw new ForbiddenError('Access token invalide');
    }
    if (!isRecord(header) || header.alg !== 'HS256' || header.typ !== 'JWT') throw new ForbiddenError('Access token invalide');
    if (!isRecord(payload)) throw new ForbiddenError('Access token invalide');

    const claims: AccessTokenClaims = Object.freeze({
      sub: stringClaim(payload, 'sub'),
      sid: stringClaim(payload, 'sid'),
      role: stringClaim(payload, 'role'),
      iat: numberClaim(payload, 'iat'),
      exp: numberClaim(payload, 'exp'),
      iss: stringClaim(payload, 'iss'),
      aud: stringClaim(payload, 'aud'),
    });
    if (claims.iss !== this.issuer || claims.aud !== this.audience) throw new ForbiddenError('Access token invalide');
    if (claims.exp <= Math.floor(this.options.clock.now().getTime() / 1000)) throw new ForbiddenError('Access token expiré');
    return claims;
  }
}
