import type { NotificationDeviceRecord, NotificationDeviceRegistry } from './notification-device-registry.js';
import type { NotificationTransport, SendNotificationInput, SentNotification } from './notification-transport.js';

export interface NotificationDeviceSendInput {
  readonly device: NotificationDeviceRecord;
  readonly notification: SendNotificationInput;
}

export interface NotificationDeviceSender {
  readonly provider: string;
  send(input: NotificationDeviceSendInput): Promise<{ readonly id: string }>;
}

export class NotificationDeviceFanoutTransport implements NotificationTransport {
  private readonly senders: ReadonlyMap<string, NotificationDeviceSender>;

  constructor(
    private readonly registry: NotificationDeviceRegistry,
    senders: readonly NotificationDeviceSender[],
  ) {
    this.senders = new Map(senders.map((sender) => [sender.provider, sender]));
  }

  async send(input: SendNotificationInput): Promise<SentNotification> {
    const devices = await this.registry.listActive({ userId: input.recipientId });
    if (devices.length === 0) {
      throw new Error(`No active notification devices for recipient ${input.recipientId}`);
    }

    const deliveries = devices.map(async (device) => {
      const sender = this.senders.get(device.provider);
      if (sender === undefined) {
        throw new Error(`No notification sender configured for provider ${device.provider}`);
      }
      return sender.send({ device, notification: input });
    });

    const results = await Promise.all(deliveries);
    const sentAt = new Date().toISOString();

    return Object.freeze({
      id: `notification:${input.deduplicationKey}`,
      recipientId: input.recipientId,
      template: input.template,
      channel: input.channel,
      payload: Object.freeze({
        ...input.payload,
        deliveryCount: results.length,
      }),
      sentAt,
    });
  }
}
