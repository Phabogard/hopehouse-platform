import assert from 'node:assert/strict';
import test from 'node:test';
import { NotificationDeviceFanoutTransport, type NotificationDeviceSender } from '../src/modules/notifications/notification-device-dispatcher.js';
import { NotificationDeviceRegistry, type NotificationDeviceRecord, type NotificationDeviceRepository } from '../src/modules/notifications/notification-device-registry.js';

function registryWith(records: NotificationDeviceRecord[]): NotificationDeviceRegistry {
  const repository: NotificationDeviceRepository = {
    async upsertActive() {
      throw new Error('not used');
    },
    async revoke() {
      throw new Error('not used');
    },
    async listActive(input) {
      return records.filter((record) => record.userId === input.userId && record.status === 'active' && (input.provider === undefined || record.provider === input.provider));
    },
  };
  return new NotificationDeviceRegistry(repository);
}

function device(overrides: Partial<NotificationDeviceRecord> = {}): NotificationDeviceRecord {
  return {
    id: 'device-1',
    userId: 'user-1',
    provider: 'in-memory',
    platform: 'android',
    installationId: 'installation-1',
    registrationToken: 'secret-token',
    status: 'active',
    createdAt: '2026-09-22T00:00:00.000Z',
    updatedAt: '2026-09-22T00:00:00.000Z',
    lastSeenAt: '2026-09-22T00:00:00.000Z',
    revokedAt: null,
    metadata: {},
    ...overrides,
  };
}

test('NotificationDeviceFanoutTransport sends to every active device through its provider sender', async () => {
  const sent: string[] = [];
  const sender: NotificationDeviceSender = {
    provider: 'in-memory',
    async send({ device, notification }) {
      sent.push(`${device.id}:${notification.deduplicationKey}`);
      return { id: `delivery-${device.id}` };
    },
  };

  const transport = new NotificationDeviceFanoutTransport(
    registryWith([
      device({ id: 'device-1', installationId: 'installation-1' }),
      device({ id: 'device-2', installationId: 'installation-2' }),
    ]),
    [sender],
  );

  const result = await transport.send({
    recipientId: 'user-1',
    template: 'recharge_confirmed',
    channel: 'push',
    deduplicationKey: 'notification:event-1',
    payload: { receiptNumber: 'R-1' },
  });

  assert.deepEqual(sent, ['device-1:notification:event-1', 'device-2:notification:event-1']);
  assert.equal(result.id, 'notification:notification:event-1');
  assert.equal(result.payload.deliveryCount, 2);
  assert.equal(result.payload.receiptNumber, 'R-1');
});

test('NotificationDeviceFanoutTransport ignores revoked devices', async () => {
  const sender: NotificationDeviceSender = {
    provider: 'in-memory',
    async send({ device }) {
      return { id: device.id };
    },
  };

  const transport = new NotificationDeviceFanoutTransport(
    registryWith([device(), device({ id: 'device-2', status: 'revoked', revokedAt: '2026-09-22T01:00:00.000Z' })]),
    [sender],
  );

  const result = await transport.send({
    recipientId: 'user-1',
    template: 'recharge_confirmed',
    channel: 'push',
    deduplicationKey: 'notification:event-2',
    payload: {},
  });

  assert.equal(result.payload.deliveryCount, 1);
});

test('NotificationDeviceFanoutTransport retries when no active device exists', async () => {
  const transport = new NotificationDeviceFanoutTransport(registryWith([]), []);

  await assert.rejects(
    transport.send({
      recipientId: 'user-1',
      template: 'recharge_confirmed',
      channel: 'push',
      deduplicationKey: 'notification:event-3',
      payload: {},
    }),
    /No active notification devices/,
  );
});

test('NotificationDeviceFanoutTransport fails when a device provider has no sender', async () => {
  const transport = new NotificationDeviceFanoutTransport(registryWith([device({ provider: 'fcm' })]), []);

  await assert.rejects(
    transport.send({
      recipientId: 'user-1',
      template: 'recharge_confirmed',
      channel: 'push',
      deduplicationKey: 'notification:event-4',
      payload: {},
    }),
    /No notification sender configured for provider fcm/,
  );
});
