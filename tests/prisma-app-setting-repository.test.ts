import assert from 'node:assert/strict';
import test from 'node:test';
import { ConfigurationService, InMemoryAppSettingRepository, type AppSetting } from '../src/modules/configuration/index.js';
import { PrismaAppSettingRepository, type PrismaAppSettingClient } from '../src/infrastructure/prisma/app-setting-repository.js';

type FakeAppSettingRecord = {
  id: string;
  namespace: string;
  key: string;
  scopeType: string;
  scopeId: string | null;
  status: AppSetting['status'];
  value: unknown;
  startsAt: Date | string | null;
  endsAt: Date | string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  metadata: unknown;
};

class FakeAppSettingClient implements PrismaAppSettingClient {
  readonly records: FakeAppSettingRecord[];
  readonly appSetting: PrismaAppSettingClient['appSetting'];

  constructor(records: readonly FakeAppSettingRecord[]) {
    this.records = [...records];
    this.appSetting = {
      findMany: async ({ where }) => this.records
        .filter((record) => record.namespace === where.namespace && record.key === where.key && record.scopeType === where.scopeType && record.scopeId === where.scopeId)
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()),
    };
  }
}

function record(input: Partial<FakeAppSettingRecord> & { id: string }): FakeAppSettingRecord {
  return {
    id: input.id,
    namespace: input.namespace ?? 'catalogues',
    key: input.key ?? 'service-definitions',
    scopeType: input.scopeType ?? 'global',
    scopeId: input.scopeId ?? null,
    status: input.status ?? 'active',
    value: input.value ?? { configurable: true },
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    createdByUserId: input.createdByUserId ?? 'admin-1',
    updatedByUserId: input.updatedByUserId ?? 'admin-1',
    createdAt: input.createdAt ?? new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: input.updatedAt ?? new Date('2026-08-02T00:00:00.000Z'),
    metadata: input.metadata ?? { source: 'test' },
  };
}

test('PrismaAppSettingRepository reads app_settings by namespace, key, and exact scope', async () => {
  const repository = new PrismaAppSettingRepository(new FakeAppSettingClient([
    record({ id: 'global-setting' }),
    record({ id: 'tenant-setting', scopeType: 'tenant', scopeId: 'tenant-1' }),
  ]));

  const globalSettings = await repository.findByIdentity({ namespace: 'catalogues', key: 'service-definitions', scope: { type: 'global', id: null } });
  const tenantSettings = await repository.findByIdentity({ namespace: 'catalogues', key: 'service-definitions', scope: { type: 'tenant', id: 'tenant-1' } });

  assert.equal(globalSettings.length, 1);
  assert.equal(globalSettings[0]?.id, 'global-setting');
  assert.equal(tenantSettings.length, 1);
  assert.equal(tenantSettings[0]?.id, 'tenant-setting');
});

test('PrismaAppSettingRepository preserves ConfigurationService behavior against in-memory repository', async () => {
  const prisma = new PrismaAppSettingRepository(new FakeAppSettingClient([record({ id: 'runtime-setting', value: { enabled: true } })]));
  const appSettings = await prisma.findByIdentity({ namespace: 'catalogues', key: 'service-definitions', scope: { type: 'global', id: null } });
  const memory = new InMemoryAppSettingRepository(appSettings);

  const prismaService = new ConfigurationService({ repository: prisma, clock: { now: () => new Date('2026-08-14T00:00:00.000Z') } });
  const memoryService = new ConfigurationService({ repository: memory, clock: { now: () => new Date('2026-08-14T00:00:00.000Z') } });

  assert.equal(
    JSON.stringify(await prismaService.resolve({ namespace: 'catalogues', key: 'service-definitions', scope: { type: 'global', id: null } })),
    JSON.stringify(await memoryService.resolve({ namespace: 'catalogues', key: 'service-definitions', scope: { type: 'global', id: null } })),
  );
});

test('Prisma auth runtime policy resolver reads active global app_settings through ConfigurationService', async () => {
  const { resolvePrismaAuthSecurityPolicy } = await import('../src/infrastructure/prisma/auth-runtime.js');
  const client = new FakeAppSettingClient([
    record({ id: 'auth-policy', namespace: 'auth-security', key: 'runtime-policy', value: { requireTwoFactor: true, accessTokenTtlMs: 600_000 } }),
  ]);

  const policy = await resolvePrismaAuthSecurityPolicy(client as never);

  assert.equal(policy.requireTwoFactor, true);
  assert.equal(policy.accessTokenTtlMs, 600_000);
});
