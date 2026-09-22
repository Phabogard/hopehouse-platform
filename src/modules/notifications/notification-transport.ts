export interface SendNotificationInput {
  readonly recipientId: string;
  readonly template: string;
  readonly channel: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface SentNotification {
  readonly id: string;
  readonly recipientId: string;
  readonly template: string;
  readonly channel: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly sentAt: string;
}

export interface NotificationTransport {
  send(input: SendNotificationInput): Promise<SentNotification>;
}

export class InMemoryNotificationTransport implements NotificationTransport {
  readonly sent: SentNotification[] = [];

  async send(input: SendNotificationInput): Promise<SentNotification> {
    const record: SentNotification = Object.freeze({
      id: `NOTIF-${this.sent.length + 1}`,
      recipientId: input.recipientId,
      template: input.template,
      channel: input.channel,
      payload: Object.freeze({ ...input.payload }),
      sentAt: new Date().toISOString(),
    });
    this.sent.push(record);
    return record;
  }
}
