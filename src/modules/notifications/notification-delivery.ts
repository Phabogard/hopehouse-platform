export type NotificationDeliveryStatus = 'sending' | 'sent' | 'failed';

export interface NotificationDeliveryRecord {
  readonly id: string;
  readonly deduplicationKey: string;
  readonly deviceId: string;
  readonly provider: string;
  readonly status: NotificationDeliveryStatus;
  readonly providerMessageId?: string;
  readonly lastError?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NotificationDeliveryRepository {
  claim(input: {
    readonly deduplicationKey: string;
    readonly deviceId: string;
    readonly provider: string;
    readonly now: string;
  }): Promise<'claimed' | 'sent' | 'sending'>;

  markSent(input: {
    readonly deduplicationKey: string;
    readonly deviceId: string;
    readonly providerMessageId: string;
    readonly now: string;
  }): Promise<void>;

  markFailed(input: {
    readonly deduplicationKey: string;
    readonly deviceId: string;
    readonly error: string;
    readonly now: string;
  }): Promise<void>;
}

export class NotificationDeliveryInProgressError extends Error {
  constructor(readonly deduplicationKey: string, readonly deviceId: string) {
    super(`Notification delivery is already in progress for ${deduplicationKey} on device ${deviceId}`);
    this.name = 'NotificationDeliveryInProgressError';
  }
}
