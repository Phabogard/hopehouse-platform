import assert from 'node:assert/strict';
import test from 'node:test';
import { NotificationDeviceFanoutTransport, type NotificationDeviceSender } from '../src/modules/notifications/notification-device-dispatcher.js';
import { NotificationDeviceRegistry, type NotificationDeviceRecord, type NotificationDeviceRepository } from '../src/modules/notifications/notification-device-registry.js';
import type { NotificationDeliveryRepository } from '../src/modules/notifications/notification-delivery.js';

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


test('FcmNotificationDeviceSender authenticates with a service account and sends a data payload', async () => {
  const { generateKeyPairSync } = await import('node:crypto');
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  const fetchMock: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url) === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'oauth-token', expires_in: 3600 }), { status: 200 });
    }
    return new Response(JSON.stringify({ name: 'projects/demo/messages/123' }), { status: 200 });
  };

  const sender = new (await import('../src/modules/notifications/notification-device-dispatcher.js')).FcmNotificationDeviceSender(
    {
      project_id: 'demo',
      client_email: 'firebase-sender@example.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    },
    fetchMock,
  );

  const result = await sender.send({
    device: device({ provider: 'fcm', registrationToken: 'fcm-token' }),
    notification: {
      recipientId: 'user-1',
      template: 'recharge_confirmed',
      channel: 'push',
      deduplicationKey: 'notification:event-5',
      payload: { receiptNumber: 'R-5', amountCents: 1000 },
    },
  });

  assert.equal(result.id, 'projects/demo/messages/123');
  assert.equal(calls.length, 2);
  assert.match(String(calls[1]?.init?.headers && new Headers(calls[1]?.init?.headers).get('authorization')), /^Bearer oauth-token$/);
  const requestBody = JSON.parse(String(calls[1]?.init?.body)) as { message: { token: string; data: Record<string, string> } };
  assert.equal(requestBody.message.token, 'fcm-token');
  assert.equal(requestBody.message.data.template, 'recharge_confirmed');
  assert.equal(requestBody.message.data.deduplicationKey, 'notification:event-5');
  assert.equal(requestBody.message.data.payload, JSON.stringify({ receiptNumber: 'R-5', amountCents: 1000 }));
});

test('NotificationDeviceFanoutTransport revokes an FCM device after UNREGISTERED', async () => {
  const revoked: string[] = [];
  const repository: NotificationDeviceRepository = {
    async upsertActive() { throw new Error('not used'); },
    async revoke(input) {
      revoked.push(input.installationId);
      return true;
    },
    async listActive() { return [device({ provider: 'fcm', installationId: 'installation-invalid' })]; },
  };
  const registry = new NotificationDeviceRegistry(repository);
  const sender: NotificationDeviceSender = {
    provider: 'fcm',
    async send() {
      const { FcmNotificationError } = await import('../src/modules/notifications/notification-device-dispatcher.js');
      throw new FcmNotificationError('token is no longer registered', 404, 'UNREGISTERED', 'UNREGISTERED', false);
    },
  };

  const transport = new NotificationDeviceFanoutTransport(registry, [sender]);

  await assert.rejects(
    transport.send({
      recipientId: 'user-1',
      template: 'recharge_confirmed',
      channel: 'push',
      deduplicationKey: 'notification:event-6',
      payload: {},
    }),
    /token is no longer registered/,
  );
  assert.deepEqual(revoked, ['installation-invalid']);
});


class DeliveryLedger implements NotificationDeliveryRepository {
  private readonly rows = new Map<string, 'sending' | 'sent' | 'failed'>();

  async claim(input: { id: string; deduplicationKey: string; deviceId: string; provider: string; now: string }): Promise<'claimed' | 'sent' | 'sending'> {
    const key = input.deduplicationKey + ':' + input.deviceId;
    const existing = this.rows.get(key);
    if (existing === 'sent' || existing === 'sending') return existing;
    this.rows.set(key, 'sending');
    return 'claimed';
  }

  async markSent(input: { deduplicationKey: string; deviceId: string; providerMessageId: string; now: string }): Promise<void> {
    this.rows.set(input.deduplicationKey + ':' + input.deviceId, 'sent');
  }

  async markFailed(input: { deduplicationKey: string; deviceId: string; error: string; now: string }): Promise<void> {
    this.rows.set(input.deduplicationKey + ':' + input.deviceId, 'failed');
  }
}

test('NotificationDeviceFanoutTransport does not send the same device twice after a successful retry', async () => {
  const ledger = new DeliveryLedger();
  let sends = 0;
  const sender: NotificationDeviceSender = {
    provider: 'fcm',
    async send() {
      sends += 1;
      return { id: 'fcm-message-1' };
    },
  };
  const transport = new NotificationDeviceFanoutTransport(registryWith([device({ provider: 'fcm' })]), [sender], ledger);
  const input = {
    recipientId: 'user-1',
    template: 'recharge_confirmed',
    channel: 'push',
    deduplicationKey: 'notification:retry-1',
    payload: {},
  };

  await transport.send(input);
  await transport.send(input);

  assert.equal(sends, 1);
});

test('NotificationDeviceFanoutTransport rejects a concurrent delivery instead of duplicating the provider call', async () => {
  const ledger = new DeliveryLedger();
  let sends = 0;
  let release: (() => void) | undefined;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const sender: NotificationDeviceSender = {
    provider: 'fcm',
    async send() {
      sends += 1;
      await blocked;
      return { id: 'fcm-message-2' };
    },
  };
  const transport = new NotificationDeviceFanoutTransport(registryWith([device({ provider: 'fcm' })]), [sender], ledger);
  const input = {
    recipientId: 'user-1',
    template: 'recharge_confirmed',
    channel: 'push',
    deduplicationKey: 'notification:concurrent-1',
    payload: {},
  };

  const first = transport.send(input);
  await new Promise<void>((resolve) => setImmediate(resolve));
  await assert.rejects(transport.send(input), /already in progress/);
  assert.equal(sends, 1);
  release?.();
  await first;
});

test('NotificationDeviceFanoutTransport can retry a delivery after a known provider failure', async () => {
  const ledger = new DeliveryLedger();
  let sends = 0;
  const sender: NotificationDeviceSender = {
    provider: 'fcm',
    async send() {
      sends += 1;
      if (sends === 1) throw new Error('temporary provider failure');
      return { id: 'fcm-message-3' };
    },
  };
  const transport = new NotificationDeviceFanoutTransport(registryWith([device({ provider: 'fcm' })]), [sender], ledger);
  const input = {
    recipientId: 'user-1',
    template: 'recharge_confirmed',
    channel: 'push',
    deduplicationKey: 'notification:failure-1',
    payload: {},
  };

  await assert.rejects(transport.send(input), /temporary provider failure/);
  await transport.send(input);
  assert.equal(sends, 2);
});
