import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryDeviceFingerprintRepository, type DeviceFingerprint } from '../src/modules/auth-security/index.js';
import { PrismaDeviceFingerprintRepository, type PrismaDeviceFingerprintClient } from '../src/infrastructure/prisma/device-fingerprint-repository.js';

function deviceFingerprint(input: { id?: string; userId?: string; fingerprintHash?: string; label?: string | null; status?: DeviceFingerprint['status']; firstSeenAt?: string; lastSeenAt?: string; revokedAt?: string | null; revokedByUserId?: string | null; metadata?: Record<string, unknown> } = {}): DeviceFingerprint {
  return Object.freeze({
    id: input.id ?? 'device-1',
    userId: input.userId ?? 'user-1',
    fingerprintHash: input.fingerprintHash ?? 'sha256:fingerprint',
    label: input.label ?? null,
    status: input.status ?? 'pending',
    firstSeenAt: input.firstSeenAt ?? '2026-07-09T00:00:00.000Z',
    lastSeenAt: input.lastSeenAt ?? '2026-07-09T00:00:00.000Z',
    revokedAt: input.revokedAt ?? null,
    revokedByUserId: input.revokedByUserId ?? null,
    metadata: Object.freeze({ ...(input.metadata ?? {}) }),
  });
}

class FakeDeviceFingerprintClient implements PrismaDeviceFingerprintClient {
  readonly records = new Map<string, {
    id: string;
    userId: string;
    fingerprintHash: string;
    label: string | null;
    status: DeviceFingerprint['status'];
    firstSeenAt: Date;
    lastSeenAt: Date;
    revokedAt: Date | null;
    revokedByUserId: string | null;
    metadata: unknown;
  }>();

  readonly deviceFingerprint: PrismaDeviceFingerprintClient['deviceFingerprint'];

  constructor() {
    this.deviceFingerprint = {
      upsert: async ({ where, create, update }) => {
        const key = this.key(where.userId_fingerprintHash.userId, where.userId_fingerprintHash.fingerprintHash);
        const record = { ...(this.records.has(key) ? update : create) };
        this.records.set(key, record);
        return record;
      },
      findUnique: async ({ where }) => this.records.get(this.key(where.userId_fingerprintHash.userId, where.userId_fingerprintHash.fingerprintHash)) ?? null,
      findMany: async ({ where }) => [...this.records.values()]
        .filter((record) => record.userId === where.userId)
        .sort((left, right) => left.firstSeenAt.getTime() - right.firstSeenAt.getTime()),
    };
  }

  private key(userId: string, fingerprintHash: string): string {
    return `${userId}:${fingerprintHash}`;
  }
}

test('PrismaDeviceFingerprintRepository creates a fingerprint with Date and metadata mapping', async () => {
  const client = new FakeDeviceFingerprintClient();
  const repository = new PrismaDeviceFingerprintRepository(client);
  const device = deviceFingerprint({ metadata: { platform: 'unit' } });

  const saved = await repository.save(device);

  assert.equal(saved.id, device.id);
  assert.equal(saved.firstSeenAt, device.firstSeenAt);
  assert.equal(JSON.stringify(saved.metadata), JSON.stringify(device.metadata));
  assert.equal(client.records.get('user-1:sha256:fingerprint')?.firstSeenAt instanceof Date, true);
});

test('PrismaDeviceFingerprintRepository updates an existing fingerprint through save', async () => {
  const client = new FakeDeviceFingerprintClient();
  const repository = new PrismaDeviceFingerprintRepository(client);
  await repository.save(deviceFingerprint({ id: 'device-1', status: 'pending' }));
  const trusted = deviceFingerprint({ id: 'device-1', status: 'trusted', label: 'Laptop', lastSeenAt: '2026-07-09T00:05:00.000Z' });

  const saved = await repository.save(trusted);

  assert.equal(saved.status, 'trusted');
  assert.equal(saved.label, 'Laptop');
  assert.equal(saved.lastSeenAt, '2026-07-09T00:05:00.000Z');
  assert.equal(client.records.size, 1);
});

test('PrismaDeviceFingerprintRepository finds fingerprints by user id and hash', async () => {
  const repository = new PrismaDeviceFingerprintRepository(new FakeDeviceFingerprintClient());
  const device = deviceFingerprint({ userId: 'user-1', fingerprintHash: 'sha256:known' });
  await repository.save(device);

  const found = await repository.findByUserIdAndHash({ userId: 'user-1', fingerprintHash: 'sha256:known' });
  const missing = await repository.findByUserIdAndHash({ userId: 'user-1', fingerprintHash: 'sha256:missing' });

  assert.equal(found?.id, device.id);
  assert.equal(missing, null);
});

test('PrismaDeviceFingerprintRepository lists fingerprints by user chronologically', async () => {
  const repository = new PrismaDeviceFingerprintRepository(new FakeDeviceFingerprintClient());
  await repository.save(deviceFingerprint({ id: 'device-2', fingerprintHash: 'sha256:2', firstSeenAt: '2026-07-09T00:00:02.000Z' }));
  await repository.save(deviceFingerprint({ id: 'other-user-device', userId: 'user-2', fingerprintHash: 'sha256:3', firstSeenAt: '2026-07-09T00:00:01.500Z' }));
  await repository.save(deviceFingerprint({ id: 'device-1', fingerprintHash: 'sha256:1', firstSeenAt: '2026-07-09T00:00:01.000Z' }));

  const devices = await repository.listByUserId('user-1');

  assert.equal(devices.map((current) => current.id).join(','), 'device-1,device-2');
});

test('PrismaDeviceFingerprintRepository never duplicates the same user fingerprint', async () => {
  const client = new FakeDeviceFingerprintClient();
  const repository = new PrismaDeviceFingerprintRepository(client);
  await repository.save(deviceFingerprint({ id: 'device-1', userId: 'user-1', fingerprintHash: 'sha256:same', status: 'pending' }));
  await repository.save(deviceFingerprint({ id: 'device-2', userId: 'user-1', fingerprintHash: 'sha256:same', status: 'trusted' }));

  const devices = await repository.listByUserId('user-1');

  assert.equal(client.records.size, 1);
  assert.equal(devices.length, 1);
  assert.equal(devices[0]?.id, 'device-2');
  assert.equal(devices[0]?.status, 'trusted');
});

test('PrismaDeviceFingerprintRepository preserves DeviceFingerprintRepository behavior against in-memory repository', async () => {
  const memory = new InMemoryDeviceFingerprintRepository();
  const prisma = new PrismaDeviceFingerprintRepository(new FakeDeviceFingerprintClient());
  const first = deviceFingerprint({ id: 'device-1', fingerprintHash: 'sha256:1' });
  const second = deviceFingerprint({ id: 'device-2', fingerprintHash: 'sha256:2', status: 'trusted' });
  const updated = deviceFingerprint({ id: 'device-1', fingerprintHash: 'sha256:1', status: 'revoked', revokedAt: '2026-07-09T00:10:00.000Z', revokedByUserId: 'admin-1' });

  for (const current of [first, second, updated]) {
    await memory.save(current);
    await prisma.save(current);
  }

  assert.equal(JSON.stringify(await prisma.findByUserIdAndHash({ userId: 'user-1', fingerprintHash: 'sha256:1' })), JSON.stringify(await memory.findByUserIdAndHash({ userId: 'user-1', fingerprintHash: 'sha256:1' })));
  assert.equal(JSON.stringify(await prisma.listByUserId('user-1')), JSON.stringify(await memory.listByUserId('user-1')));
});
