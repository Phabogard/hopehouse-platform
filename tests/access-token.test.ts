import assert from 'node:assert/strict';
import test from 'node:test';
import { AccessTokenService, type Clock } from '../src/modules/auth-security/index.js';

class FixedClock implements Clock {
  constructor(private current = new Date('2026-07-09T00:00:00.000Z')) {}
  now(): Date { return new Date(this.current); }
  advance(ms: number): void { this.current = new Date(this.current.getTime() + ms); }
}

function makeService(clock = new FixedClock()): AccessTokenService {
  return new AccessTokenService({ secret: 'unit-test-secret', issuer: 'hopehouse-platform', audience: 'hopehouse-api', ttlMs: 60_000, clock });
}

test('AccessTokenService issues signed JWT claims bound to a revocable session id', () => {
  const token = makeService().issue({ userId: 'user-1', sessionId: 'session-1', role: 'system_admin' });
  const claims = makeService().verify(token);

  assert.equal(token.split('.').length, 3);
  assert.equal(claims.sub, 'user-1');
  assert.equal(claims.sid, 'session-1');
  assert.equal(claims.role, 'system_admin');
  assert.equal(claims.iss, 'hopehouse-platform');
  assert.equal(claims.aud, 'hopehouse-api');
});

test('AccessTokenService rejects tampered, expired, and misconfigured tokens', () => {
  const clock = new FixedClock();
  const service = makeService(clock);
  const token = service.issue({ userId: 'user-1', sessionId: 'session-1', role: 'system_admin' });
  const parts = token.split('.');
  const tampered = `${parts[0]}.${parts[1]}.invalid-signature`;

  assert.throws(() => service.verify(tampered), /Access token invalide/);
  clock.advance(60_001);
  assert.throws(() => service.verify(token), /expiré/);
  assert.throws(() => new AccessTokenService({ secret: '', issuer: 'hopehouse-platform', audience: 'hopehouse-api', ttlMs: 60_000, clock }), /secret/);
});
