import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  NotificationDeviceRecord,
  NotificationDeviceRepository,
  RegisterNotificationDeviceInput,
} from '../../modules/notifications/notification-device-registry.js';
import { newNotificationDeviceId } from '../../modules/notifications/notification-device-registry.js';

type NotificationDeviceClient = Pick<PrismaClient, 'notificationDevice'>;

function toRecord(device: {
  id: string;
  userId: string;
  provider: string;
  platform: string;
  installationId: string;
  registrationToken: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
  metadata: unknown;
}): NotificationDeviceRecord {
  const status = device.status;
  if (status !== 'active' && status !== 'revoked' && status !== 'archived') {
    throw new Error('Unsupported notification device status: ' + status);
  }

  return {
    id: device.id,
    userId: device.userId,
    provider: device.provider,
    platform: device.platform,
    installationId: device.installationId,
    registrationToken: device.registrationToken,
    status,
    createdAt: device.createdAt.toISOString(),
    updatedAt: device.updatedAt.toISOString(),
    lastSeenAt: device.lastSeenAt.toISOString(),
    revokedAt: device.revokedAt?.toISOString() ?? null,
    metadata: (device.metadata ?? {}) as Readonly<Record<string, unknown>>,
  };
}

export class PrismaNotificationDeviceRepository implements NotificationDeviceRepository {
  constructor(private readonly prisma: NotificationDeviceClient) {}

  async upsertActive(input: RegisterNotificationDeviceInput & { readonly now: string }): Promise<NotificationDeviceRecord> {
    const now = new Date(input.now);
    const metadata = (input.metadata ?? {}) as Prisma.InputJsonValue;

    const device = await this.prisma.notificationDevice.upsert({
      where: {
        notification_devices_user_provider_installation_unique: {
          userId: input.userId,
          provider: input.provider,
          installationId: input.installationId,
        },
      },
      create: {
        id: newNotificationDeviceId(),
        userId: input.userId,
        provider: input.provider,
        platform: input.platform,
        installationId: input.installationId,
        registrationToken: input.registrationToken,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
        revokedAt: null,
        metadata,
      },
      update: {
        platform: input.platform,
        registrationToken: input.registrationToken,
        status: 'active',
        updatedAt: now,
        lastSeenAt: now,
        revokedAt: null,
        metadata,
      },
    });

    return toRecord(device);
  }

  async revoke(input: { readonly userId: string; readonly provider: string; readonly installationId: string; readonly now: string }): Promise<boolean> {
    const device = await this.prisma.notificationDevice.findUnique({
      where: {
        notification_devices_user_provider_installation_unique: {
          userId: input.userId,
          provider: input.provider,
          installationId: input.installationId,
        },
      },
    });

    if (device === null || device.status === 'revoked' || device.status === 'archived') return false;

    await this.prisma.notificationDevice.update({
      where: { id: device.id },
      data: {
        status: 'revoked',
        revokedAt: new Date(input.now),
        updatedAt: new Date(input.now),
      },
    });

    return true;
  }

  async listActive(input: { readonly userId: string; readonly provider?: string }): Promise<readonly NotificationDeviceRecord[]> {
    const devices = await this.prisma.notificationDevice.findMany({
      where: {
        userId: input.userId,
        status: 'active',
        ...(input.provider === undefined ? {} : { provider: input.provider }),
      },
      orderBy: { lastSeenAt: 'desc' },
    });

    return devices.map(toRecord);
  }
}
