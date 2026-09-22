import { randomUUID } from 'node:crypto';

export interface RegisterNotificationDeviceInput {
  readonly userId: string;
  readonly provider: string;
  readonly platform: string;
  readonly installationId: string;
  readonly registrationToken: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly now?: string;
}

export interface NotificationDeviceRecord {
  readonly id: string;
  readonly userId: string;
  readonly provider: string;
  readonly platform: string;
  readonly installationId: string;
  readonly registrationToken: string;
  readonly status: 'active' | 'revoked' | 'archived';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastSeenAt: string;
  readonly revokedAt: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface NotificationDeviceRepository {
  upsertActive(input: RegisterNotificationDeviceInput & { readonly now: string }): Promise<NotificationDeviceRecord>;
  revoke(input: { readonly userId: string; readonly provider: string; readonly installationId: string; readonly now: string }): Promise<boolean>;
  listActive(input: { readonly userId: string; readonly provider?: string }): Promise<readonly NotificationDeviceRecord[]>;
}

export class NotificationDeviceRegistry {
  constructor(private readonly repository: NotificationDeviceRepository) {}

  async register(input: RegisterNotificationDeviceInput): Promise<NotificationDeviceRecord> {
    const now = input.now ?? new Date().toISOString();
    if (!input.userId.trim()) throw new Error('Notification device userId is required');
    if (!input.provider.trim()) throw new Error('Notification device provider is required');
    if (!input.platform.trim()) throw new Error('Notification device platform is required');
    if (!input.installationId.trim()) throw new Error('Notification device installationId is required');
    if (!input.registrationToken.trim()) throw new Error('Notification device registrationToken is required');

    return this.repository.upsertActive({ ...input, now });
  }

  revoke(input: { readonly userId: string; readonly provider: string; readonly installationId: string; readonly now?: string }): Promise<boolean> {
    const now = input.now ?? new Date().toISOString();
    return this.repository.revoke({ ...input, now });
  }

  listActive(input: { readonly userId: string; readonly provider?: string }): Promise<readonly NotificationDeviceRecord[]> {
    return this.repository.listActive(input);
  }
}

export function newNotificationDeviceId(): string {
  return randomUUID();
}
