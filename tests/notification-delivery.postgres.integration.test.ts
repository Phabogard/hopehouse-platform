import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { PrismaNotificationDeliveryRepository } from '../src/infrastructure/prisma/notification-delivery-repository.js';
import { PrismaNotificationDeviceRepository } from '../src/infrastructure/prisma/notification-device-repository.js';
import { NotificationDeviceRegistry } from '../src/modules/notifications/notification-device-registry.js';
import { NotificationDeliveryInProgressError } from '../src/modules/notifications/notification-delivery.js';
import {
  NotificationDeviceFanoutTransport,
  type NotificationDeviceSender,
} from '../src/modules/notifications/notification-device-dispatcher.js';

const databaseUrl = process.env.DATABASE_URL;

function integrationClient(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: databaseUrl as string } } });
}

async function createTestUserAndDevice(client: PrismaClient) {
  const userId = `user-${randomUUID()}`;
  const deviceId = `device-${randomUUID()}`;

  await client.role.upsert({
    where: { id: 'CLIENT' },
    update: {},
    create: {
      id: 'CLIENT',
      name: 'CLIENT',
      description: 'Client role for tests',
    },
  });

  await client.user.create({
    data: {
      id: userId,
      email: `${userId}@example.com`,
      displayName: 'Test User',
      status: 'active',
      roleId: 'CLIENT',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  await client.notificationDevice.create({
    data: {
      id: deviceId,
      userId,
      provider: 'fcm',
      platform: 'android',
      installationId: `inst-${randomUUID()}`,
      registrationToken: `token-${randomUUID()}`,
      status: 'active',
      lastSeenAt: new Date(),
      metadata: {},
    },
  });

  return { userId, deviceId };
}

test(
  'PrismaNotificationDeliveryRepository: premier envoi et transition vers sent',
  { skip: databaseUrl === undefined },
  async () => {
    const client = integrationClient();
    const repo = new PrismaNotificationDeliveryRepository(client);
    let testData: { userId: string; deviceId: string } | undefined;
    const deduplicationKey = `dedup:${randomUUID()}`;

    try {
      testData = await createTestUserAndDevice(client);
      const now = new Date().toISOString();

      // 1. Premier envoi -> claim
      const claimResult = await repo.claim({
        id: randomUUID(),
        deduplicationKey,
        deviceId: testData.deviceId,
        provider: 'fcm',
        now,
      });

      assert.equal(claimResult, 'claimed');

      // Vérification état DB -> 'sending'
      const rowSending = await client.notificationDelivery.findUnique({
        where: {
          notification_deliveries_key_device_unique: {
            deduplicationKey,
            deviceId: testData.deviceId,
          },
        },
      });
      assert.ok(rowSending !== null);
      assert.equal(rowSending.status, 'sending');
      assert.equal(rowSending.providerMessageId, null);

      // 2. Mark Sent
      const providerMessageId = `fcm-msg-${randomUUID()}`;
      await repo.markSent({
        deduplicationKey,
        deviceId: testData.deviceId,
        providerMessageId,
        now: new Date().toISOString(),
      });

      // Vérification état DB -> 'sent'
      const rowSent = await client.notificationDelivery.findUnique({
        where: {
          notification_deliveries_key_device_unique: {
            deduplicationKey,
            deviceId: testData.deviceId,
          },
        },
      });
      assert.ok(rowSent !== null);
      assert.equal(rowSent.status, 'sent');
      assert.equal(rowSent.providerMessageId, providerMessageId);
      assert.equal(rowSent.lastError, null);
    } finally {
      if (testData !== undefined) {
        await client.notificationDelivery.deleteMany({ where: { deviceId: testData.deviceId } });
        await client.notificationDevice.deleteMany({ where: { id: testData.deviceId } });
        await client.user.deleteMany({ where: { id: testData.userId } });
      }
      await client.$disconnect();
    }
  },
);

test(
  'PrismaNotificationDeliveryRepository: redelivery avec la même clé retourne sent',
  { skip: databaseUrl === undefined },
  async () => {
    const client = integrationClient();
    const repo = new PrismaNotificationDeliveryRepository(client);
    let testData: { userId: string; deviceId: string } | undefined;
    const deduplicationKey = `dedup:${randomUUID()}`;

    try {
      testData = await createTestUserAndDevice(client);
      const now = new Date().toISOString();

      // Premier envoi
      await repo.claim({ id: randomUUID(), deduplicationKey, deviceId: testData.deviceId, provider: 'fcm', now });
      await repo.markSent({
        deduplicationKey,
        deviceId: testData.deviceId,
        providerMessageId: 'msg-123',
        now,
      });

      // Redelivery
      const redeliveryResult = await repo.claim({
        id: randomUUID(),
        deduplicationKey,
        deviceId: testData.deviceId,
        provider: 'fcm',
        now: new Date().toISOString(),
      });

      assert.equal(redeliveryResult, 'sent');
    } finally {
      if (testData !== undefined) {
        await client.notificationDelivery.deleteMany({ where: { deviceId: testData.deviceId } });
        await client.notificationDevice.deleteMany({ where: { id: testData.deviceId } });
        await client.user.deleteMany({ where: { id: testData.userId } });
      }
      await client.$disconnect();
    }
  },
);

test(
  'PrismaNotificationDeliveryRepository: deux réclamations concurrentes réelles -> exactement une claimed et une sending',
  { skip: databaseUrl === undefined },
  async () => {
    const clientA = integrationClient();
    const clientB = integrationClient();
    const repoA = new PrismaNotificationDeliveryRepository(clientA);
    const repoB = new PrismaNotificationDeliveryRepository(clientB);
    let testData: { userId: string; deviceId: string } | undefined;
    const deduplicationKey = `dedup-concurrent:${randomUUID()}`;

    try {
      testData = await createTestUserAndDevice(clientA);
      const now = new Date().toISOString();

      // Exécution de 2 claims concurrents
      const [resA, resB] = await Promise.all([
        repoA.claim({ id: randomUUID(), deduplicationKey, deviceId: testData.deviceId, provider: 'fcm', now }),
        repoB.claim({ id: randomUUID(), deduplicationKey, deviceId: testData.deviceId, provider: 'fcm', now }),
      ]);

      const claimedCount = [resA, resB].filter((r) => r === 'claimed').length;
      const sendingCount = [resA, resB].filter((r) => r === 'sending').length;

      assert.equal(claimedCount, 1, 'Exactement une réclamation doit réussir (claimed)');
      assert.equal(sendingCount, 1, 'L autre réclamation concurrente doit être détectée en cours (sending)');

      // Vérification dans la base qu un seul enregistrement existe
      const rows = await clientA.notificationDelivery.findMany({
        where: { deduplicationKey, deviceId: testData.deviceId },
      });
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.status, 'sending');
    } finally {
      if (testData !== undefined) {
        await clientA.notificationDelivery.deleteMany({ where: { deviceId: testData.deviceId } });
        await clientA.notificationDevice.deleteMany({ where: { id: testData.deviceId } });
        await clientA.user.deleteMany({ where: { id: testData.userId } });
      }
      await Promise.all([clientA.$disconnect(), clientB.$disconnect()]);
    }
  },
);

test(
  'PrismaNotificationDeliveryRepository: retry après une erreur provider connue',
  { skip: databaseUrl === undefined },
  async () => {
    const client = integrationClient();
    const repo = new PrismaNotificationDeliveryRepository(client);
    let testData: { userId: string; deviceId: string } | undefined;
    const deduplicationKey = `dedup-retry:${randomUUID()}`;

    try {
      testData = await createTestUserAndDevice(client);
      const now1 = new Date().toISOString();

      // 1. Claim initial
      const claim1 = await repo.claim({
        id: randomUUID(),
        deduplicationKey,
        deviceId: testData.deviceId,
        provider: 'fcm',
        now: now1,
      });
      assert.equal(claim1, 'claimed');

      // 2. Provider en erreur -> markFailed
      const errorMessage = 'FCM 503 Service Unavailable';
      await repo.markFailed({
        deduplicationKey,
        deviceId: testData.deviceId,
        error: errorMessage,
        now: new Date().toISOString(),
      });

      // Vérification état DB -> 'failed'
      const rowFailed = await client.notificationDelivery.findUniqueOrThrow({
        where: {
          notification_deliveries_key_device_unique: {
            deduplicationKey,
            deviceId: testData.deviceId,
          },
        },
      });
      assert.equal(rowFailed.status, 'failed');
      assert.equal(rowFailed.lastError, errorMessage);

      // 3. Retry -> claim re-autorise l envoi
      const now2 = new Date().toISOString();
      const claim2 = await repo.claim({
        id: randomUUID(),
        deduplicationKey,
        deviceId: testData.deviceId,
        provider: 'fcm',
        now: now2,
      });

      assert.equal(claim2, 'claimed');

      // Vérification état DB -> 'sending', lastError effacé
      const rowRetried = await client.notificationDelivery.findUniqueOrThrow({
        where: {
          notification_deliveries_key_device_unique: {
            deduplicationKey,
            deviceId: testData.deviceId,
          },
        },
      });
      assert.equal(rowRetried.status, 'sending');
      assert.equal(rowRetried.lastError, null);

      // 4. Succès final
      await repo.markSent({
        deduplicationKey,
        deviceId: testData.deviceId,
        providerMessageId: 'fcm-msg-retry-success',
        now: new Date().toISOString(),
      });

      const rowFinal = await client.notificationDelivery.findUniqueOrThrow({
        where: {
          notification_deliveries_key_device_unique: {
            deduplicationKey,
            deviceId: testData.deviceId,
          },
        },
      });
      assert.equal(rowFinal.status, 'sent');
      assert.equal(rowFinal.providerMessageId, 'fcm-msg-retry-success');
    } finally {
      if (testData !== undefined) {
        await client.notificationDelivery.deleteMany({ where: { deviceId: testData.deviceId } });
        await client.notificationDevice.deleteMany({ where: { id: testData.deviceId } });
        await client.user.deleteMany({ where: { id: testData.userId } });
      }
      await client.$disconnect();
    }
  },
);

test(
  'PrismaNotificationDeliveryRepository: deux retries concurrents après un échec -> exactement un réclame le retry',
  { skip: databaseUrl === undefined },
  async () => {
    const clientA = integrationClient();
    const clientB = integrationClient();
    const repoA = new PrismaNotificationDeliveryRepository(clientA);
    const repoB = new PrismaNotificationDeliveryRepository(clientB);
    let testData: { userId: string; deviceId: string } | undefined;
    const deduplicationKey = `dedup-retry-concurrent:${randomUUID()}`;

    try {
      testData = await createTestUserAndDevice(clientA);
      const now = new Date().toISOString();

      // Passer la livraison en status 'failed'
      await repoA.claim({ id: randomUUID(), deduplicationKey, deviceId: testData.deviceId, provider: 'fcm', now });
      await repoA.markFailed({
        deduplicationKey,
        deviceId: testData.deviceId,
        error: 'Initial provider failure',
        now,
      });

      // Deux retries concurrents
      const [resA, resB] = await Promise.all([
        repoA.claim({ id: randomUUID(), deduplicationKey, deviceId: testData.deviceId, provider: 'fcm', now: new Date().toISOString() }),
        repoB.claim({ id: randomUUID(), deduplicationKey, deviceId: testData.deviceId, provider: 'fcm', now: new Date().toISOString() }),
      ]);

      const claimedCount = [resA, resB].filter((r) => r === 'claimed').length;
      const sendingCount = [resA, resB].filter((r) => r === 'sending').length;

      assert.equal(claimedCount, 1, 'Un seul retry concurrent doit obtenir status claimed');
      assert.equal(sendingCount, 1, 'L autre retry concurrent doit recevoir status sending');
    } finally {
      if (testData !== undefined) {
        await clientA.notificationDelivery.deleteMany({ where: { deviceId: testData.deviceId } });
        await clientA.notificationDevice.deleteMany({ where: { id: testData.deviceId } });
        await clientA.user.deleteMany({ where: { id: testData.userId } });
      }
      await Promise.all([clientA.$disconnect(), clientB.$disconnect()]);
    }
  },
);

test(
  'PrismaNotificationDeliveryRepository: contrainte d unicité PostgreSQL deduplicationKey + deviceId',
  { skip: databaseUrl === undefined },
  async () => {
    const client = integrationClient();
    let testData: { userId: string; deviceId: string } | undefined;
    const deduplicationKey = `dedup-constraint:${randomUUID()}`;

    try {
      testData = await createTestUserAndDevice(client);

      // Insertion directe
      await client.notificationDelivery.create({
        data: {
          id: randomUUID(),
          deduplicationKey,
          deviceId: testData.deviceId,
          provider: 'fcm',
          status: 'sending',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Seconde insertion directe avec la même clé et le même device -> violation de contrainte unique (code 23505)
      await assert.rejects(
        client.notificationDelivery.create({
          data: {
            id: randomUUID(),
            deduplicationKey,
            deviceId: testData.deviceId,
            provider: 'fcm',
            status: 'sending',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        }),
        (error: any) => error?.code === 'P2002' || String(error).includes('Unique constraint failed'),
      );
    } finally {
      if (testData !== undefined) {
        await client.notificationDelivery.deleteMany({ where: { deviceId: testData.deviceId } });
        await client.notificationDevice.deleteMany({ where: { id: testData.deviceId } });
        await client.user.deleteMany({ where: { id: testData.userId } });
      }
      await client.$disconnect();
    }
  },
);

test(
  'NotificationDeviceFanoutTransport + PrismaNotificationDeliveryRepository: absence de double envoi garanti par le ledger applicatif',
  { skip: databaseUrl === undefined },
  async () => {
    const client = integrationClient();
    const deliveryRepo = new PrismaNotificationDeliveryRepository(client);
    const deviceRepo = new PrismaNotificationDeviceRepository(client);
    const registry = new NotificationDeviceRegistry(deviceRepo);

    let testData: { userId: string; deviceId: string } | undefined;
    let providerSendCalls = 0;

    const mockSender: NotificationDeviceSender = {
      provider: 'fcm',
      async send() {
        providerSendCalls += 1;
        return { id: `fcm-message-${providerSendCalls}` };
      },
    };

    const transport = new NotificationDeviceFanoutTransport(registry, [mockSender], deliveryRepo);
    const deduplicationKey = `notification:recharge:${randomUUID()}`;

    try {
      testData = await createTestUserAndDevice(client);

      const notificationInput = {
        recipientId: testData.userId,
        template: 'recharge_confirmed',
        channel: 'push' as const,
        deduplicationKey,
        payload: { amountCents: 5000 },
      };

      // 1. Premier envoi
      const firstResult = await transport.send(notificationInput);
      assert.equal(firstResult.payload.deliveryCount, 1);
      assert.equal(providerSendCalls, 1);

      // 2. Rejeu / redelivery applicative avec la même clé
      const secondResult = await transport.send(notificationInput);
      assert.equal(secondResult.payload.deliveryCount, 0, 'Le rejeu doit être ignoré par le ledger applicatif (deliveryCount === 0)');
      assert.equal(providerSendCalls, 1, 'Aucun appel provider supplémentaire ne doit être effectué');
    } finally {
      if (testData !== undefined) {
        await client.notificationDelivery.deleteMany({ where: { deviceId: testData.deviceId } });
        await client.notificationDevice.deleteMany({ where: { id: testData.deviceId } });
        await client.user.deleteMany({ where: { id: testData.userId } });
      }
      await client.$disconnect();
    }
  },
);
