import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NotificationDeviceRegistry,
  type NotificationDeviceRecord,
  type NotificationDeviceRepository,
} from '../src/modules/notifications/notification-device-registry.js';

class FakeNotificationDeviceRepository implements NotificationDeviceRepository {
  readonly devices = new Map<string, NotificationDeviceRecord>();

  async upsertActive(input: Parameters<NotificationDeviceRepository['upsertActive']>[0]): Promise<NotificationDeviceRecord> {
    const key = [input.userId, input.provider, input.installationId].join(':');
    const existing = this.devices.get(key);
    const record: NotificationDeviceRecord = {
      id: existing?.id ?? 'device-1',
      userId: input.userId,
      provider: input.provider,
      platform: input.platform,
      installationId: input.installationId,
      registrationToken: input.registrationToken,
      status: 'active',
      createdAt: existing?.createdAt ?? input.now,
      updatedAt: input.now,
      lastSeenAt: input.now,
      revokedAt: null,
      metadata: input.metadata ?? {},
    };
    this.devices.set(key, record);
    return record;
  }

  async revoke(input: Parameters<NotificationDeviceRepository['revoke']>[0]): Promise<boolean> {
    const key = [input.userId, input.provider, input.installationId].join(':');
    const existing = this.devices.get(key);
    if (!existing || existing.status !== 'active') return false;
    this.devices.set(key, {
      ...existing,
      status: 'revoked',
      revokedAt: input.now,
      updatedAt: input.now,
    });
    return true;
  }

  async listActive(input: Parameters<NotificationDeviceRepository['listActive']>[0]): Promise<readonly NotificationDeviceRecord[]> {
    return [...this.devices.values()].filter((device) =>
      device.userId === input.userId &&
      device.status === 'active' &&
      (input.provider === undefined || device.provider === input.provider),
    );
  }
}

test('notification device registry upserts a provider-neutral registration', async () => {
  const repository = new FakeNotificationDeviceRepository();
  const registry = new NotificationDeviceRegistry(repository);

  const first = await registry.register({
    userId: 'user-1',
    provider: 'fcm',
    platform: 'android',
    installationId: 'installation-1',
    registrationToken: 'token-a',
    now: '2026-09-22T15:00:00.000Z',
  });

  const rotated = await registry.register({
    userId: 'user-1',
    provider: 'fcm',
    platform: 'android',
    installationId: 'installation-1',
    registrationToken: 'token-b',
    now: '2026-09-22T15:05:00.000Z',
  });

  assert.equal(rotated.id, first.id);
  assert.equal(rotated.registrationToken, 'token-b');
  assert.equal(rotated.status, 'active');
  assert.equal(rotated.lastSeenAt, '2026-09-22T15:05:00.000Z');
  assert.equal((await registry.listActive({ userId: 'user-1', provider: 'fcm' })).length, 1);
});

test('notification device registry revokes a registration without deleting its identity', async () => {
  const repository = new FakeNotificationDeviceRepository();
  const registry = new NotificationDeviceRegistry(repository);

  await registry.register({
    userId: 'user-2',
    provider: 'web-push',
    platform: 'web',
    installationId: 'browser-1',
    registrationToken: 'endpoint-1',
    now: '2026-09-22T15:00:00.000Z',
  });

  assert.equal(await registry.revoke({
    userId: 'user-2',
    provider: 'web-push',
    installationId: 'browser-1',
    now: '2026-09-22T15:10:00.000Z',
  }), true);

  assert.equal((await registry.listActive({ userId: 'user-2' })).length, 0);
  assert.equal(await registry.revoke({
    userId: 'user-2',
    provider: 'web-push',
    installationId: 'browser-1',
    now: '2026-09-22T15:11:00.000Z',
  }), false);
});

test('notification device registry rejects incomplete registrations', async () => {
  const registry = new NotificationDeviceRegistry(new FakeNotificationDeviceRepository());

  await assert.rejects(
    registry.register({
      userId: '',
      provider: 'fcm',
      platform: 'android',
      installationId: 'installation-1',
      registrationToken: 'token',
    }),
    /userId is required/,
  );
});
