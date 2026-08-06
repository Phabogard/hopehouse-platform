import type { DeviceFingerprintRepository } from '../../modules/auth-security/repositories.js';
import type { DeviceFingerprint } from '../../modules/auth-security/types.js';
import { parseDomainDate, parseNullableDomainDate, toDomainIso, toReadonlyJsonObject } from './mappers.js';

type PrismaDeviceFingerprintRecord = {
  readonly id: string;
  readonly userId: string;
  readonly fingerprintHash: string;
  readonly label: string | null;
  readonly status: DeviceFingerprint['status'];
  readonly firstSeenAt: Date | string;
  readonly lastSeenAt: Date | string;
  readonly revokedAt: Date | string | null;
  readonly revokedByUserId: string | null;
  readonly metadata: unknown;
};

type PrismaDeviceFingerprintSaveInput = {
  readonly id: string;
  readonly userId: string;
  readonly fingerprintHash: string;
  readonly label: string | null;
  readonly status: DeviceFingerprint['status'];
  readonly firstSeenAt: Date;
  readonly lastSeenAt: Date;
  readonly revokedAt: Date | null;
  readonly revokedByUserId: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
};

type PrismaDeviceFingerprintDelegate = {
  upsert(input: {
    readonly where: { readonly userId_fingerprintHash: { readonly userId: string; readonly fingerprintHash: string } };
    readonly create: PrismaDeviceFingerprintSaveInput;
    readonly update: PrismaDeviceFingerprintSaveInput;
  }): Promise<PrismaDeviceFingerprintRecord>;
  findUnique(input: {
    readonly where: { readonly userId_fingerprintHash: { readonly userId: string; readonly fingerprintHash: string } };
  }): Promise<PrismaDeviceFingerprintRecord | null>;
  findMany(input: {
    readonly where: { readonly userId: string };
    readonly orderBy: { readonly firstSeenAt: 'asc' };
  }): Promise<readonly PrismaDeviceFingerprintRecord[]>;
};

export interface PrismaDeviceFingerprintClient {
  readonly deviceFingerprint: PrismaDeviceFingerprintDelegate;
}

function toSaveInput(device: DeviceFingerprint): PrismaDeviceFingerprintSaveInput {
  return {
    id: device.id,
    userId: device.userId,
    fingerprintHash: device.fingerprintHash,
    label: device.label,
    status: device.status,
    firstSeenAt: parseDomainDate(device.firstSeenAt, 'device fingerprint first seen'),
    lastSeenAt: parseDomainDate(device.lastSeenAt, 'device fingerprint last seen'),
    revokedAt: parseNullableDomainDate(device.revokedAt, 'device fingerprint revocation'),
    revokedByUserId: device.revokedByUserId,
    metadata: device.metadata,
  };
}

function nullableIso(value: Date | string | null): string | null {
  return value === null ? null : toDomainIso(value);
}

function toDomain(record: PrismaDeviceFingerprintRecord): DeviceFingerprint {
  return Object.freeze({
    id: record.id,
    userId: record.userId,
    fingerprintHash: record.fingerprintHash,
    label: record.label,
    status: record.status,
    firstSeenAt: toDomainIso(record.firstSeenAt),
    lastSeenAt: toDomainIso(record.lastSeenAt),
    revokedAt: nullableIso(record.revokedAt),
    revokedByUserId: record.revokedByUserId,
    metadata: toReadonlyJsonObject(record.metadata),
  });
}

export class PrismaDeviceFingerprintRepository implements DeviceFingerprintRepository {
  constructor(private readonly client: PrismaDeviceFingerprintClient) {}

  async findByUserIdAndHash(input: { userId: string; fingerprintHash: string }): Promise<DeviceFingerprint | null> {
    const device = await this.client.deviceFingerprint.findUnique({ where: { userId_fingerprintHash: input } });
    return device === null ? null : toDomain(device);
  }

  async save(device: DeviceFingerprint): Promise<DeviceFingerprint> {
    const data = toSaveInput(device);
    const saved = await this.client.deviceFingerprint.upsert({
      where: { userId_fingerprintHash: { userId: device.userId, fingerprintHash: device.fingerprintHash } },
      create: data,
      update: data,
    });
    return toDomain(saved);
  }

  async listByUserId(userId: string): Promise<readonly DeviceFingerprint[]> {
    const devices = await this.client.deviceFingerprint.findMany({ where: { userId }, orderBy: { firstSeenAt: 'asc' } });
    return Object.freeze(devices.map(toDomain));
  }
}
