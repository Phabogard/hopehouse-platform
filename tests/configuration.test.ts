import assert from 'node:assert/strict';
import test from 'node:test';
import { createHopeHouseServer } from '../src/app.js';
import { InMemoryAppSettingRepository, ConfigurationService, type AppSetting, type AppSettingScope } from '../src/modules/configuration/index.js';
import { can, type Actor } from '../src/modules/rbac/authorize.js';
import { type Role } from '../src/modules/rbac/permissions.js';

const now = new Date('2026-08-14T00:00:00.000Z');
const globalScope = Object.freeze({ type: 'global', id: null });

function setting(input: Partial<AppSetting> & { id: string; namespace?: string; key?: string; scope?: AppSettingScope; value?: unknown }): AppSetting {
  return Object.freeze({
    id: input.id,
    namespace: input.namespace ?? 'auth-security',
    key: input.key ?? 'runtime-policy',
    scope: input.scope ?? globalScope,
    status: input.status ?? 'active',
    value: input.value ?? Object.freeze({ requireTwoFactor: true }),
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    createdByUserId: input.createdByUserId ?? 'system-admin',
    updatedByUserId: input.updatedByUserId ?? 'system-admin',
    createdAt: input.createdAt ?? '2026-08-01T00:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-08-01T00:00:00.000Z',
    metadata: input.metadata ?? Object.freeze({}),
  });
}

function service(settings: readonly AppSetting[]): ConfigurationService {
  return new ConfigurationService({ repository: new InMemoryAppSettingRepository(settings), clock: { now: () => now } });
}

async function resolve(settings: readonly AppSetting[], scope: AppSettingScope = globalScope): Promise<AppSetting | null> {
  return service(settings).resolve({ namespace: 'auth-security', key: 'runtime-policy', scope });
}

test('ConfigurationService resolves currently active app_settings values', async () => {
  const resolved = await resolve([setting({ id: 'active-setting', value: { accessTokenTtlMs: 900_000 } })]);

  assert.equal(resolved?.id, 'active-setting');
  assert.equal((resolved?.value as { accessTokenTtlMs?: number }).accessTokenTtlMs, 900_000);
});

test('ConfigurationService refuses draft, archived, future, expired, missing, and invalid app_settings safely', async () => {
  for (const candidate of [
    setting({ id: 'draft-setting', status: 'draft' }),
    setting({ id: 'archived-setting', status: 'archived' }),
    setting({ id: 'future-setting', startsAt: '2026-08-15T00:00:00.000Z' }),
    setting({ id: 'expired-setting', endsAt: '2026-08-13T23:59:59.000Z' }),
    setting({ id: 'bad-start-date', startsAt: 'not-a-date' }),
    setting({ id: 'bad-end-date', endsAt: 'not-a-date' }),
    setting({ id: 'invalid-value', value: 'raw-secret-like-string' }),
    setting({ id: 'invalid-array', value: ['not', 'runtime', 'configuration'] }),
  ]) {
    assert.equal(await resolve([candidate]), null, candidate.id);
  }

  assert.equal(await resolve([]), null);
});

test('ConfigurationService requires exact scope and does not leak settings across scopes', async () => {
  const tenantScope = Object.freeze({ type: 'tenant', id: 'tenant-1' });
  const otherTenantScope = Object.freeze({ type: 'tenant', id: 'tenant-2' });
  const tenantSetting = setting({ id: 'tenant-setting', scope: tenantScope, value: { provider: 'tenant-provider' } });

  assert.equal((await resolve([tenantSetting], tenantScope))?.id, 'tenant-setting');
  assert.equal(await resolve([tenantSetting], otherTenantScope), null);
  assert.equal(await resolve([tenantSetting], globalScope), null);
});

test('ConfigurationService does not expose sensitive values in errors or logs', async () => {
  const secretValue = 'super-secret-token-value';
  const logs: string[] = [];
  const originalConsoleError = console.error;
  console.error = (...input: unknown[]) => { logs.push(input.map(String).join(' ')); };
  try {
    const resolved = await resolve([setting({ id: 'sensitive-setting', value: { token: secretValue }, metadata: { sensitive: true } })]);
    assert.equal((resolved?.value as { token?: string }).token, secretValue);
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(logs.join('\n').includes(secretValue), false);
});

test('no configuration administration API is exposed to unauthenticated callers in this lot', async () => {
  const server = createHopeHouseServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('Adresse serveur invalide');
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/app-settings`);
    assert.equal(response.status, 404);
  } finally {
    await new Promise<void>((resolve) => server.close(resolve));
  }
});

test('current RBAC does not grant non-super-admin roles configuration administration privileges', () => {
  for (const role of ['client', 'operations_agent', 'accountant', 'auditor', 'business_admin'] as const) {
    const actor: Actor = { id: `${role}-user`, role };
    assert.equal(can(actor, 'roles:manage'), false, `${role} roles:manage`);
    assert.equal(can(actor, 'users:manage'), false, `${role} users:manage`);
  }

  assert.equal(can({ id: 'auditor-user', role: 'auditor' }, 'audit:read'), true);
  assert.equal(can({ id: 'business-admin-user', role: 'business_admin' }, 'users:read'), true);
  assert.equal(can({ id: 'super-admin-user', role: 'system_admin' }, 'roles:manage'), true);
  assert.equal(can({ id: 'super-admin-user', role: 'system_admin' }, 'users:manage'), true);
});
