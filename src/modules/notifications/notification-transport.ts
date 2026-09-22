export interface SendNotificationInput {
  readonly recipientId: string;
  readonly template: string;
  readonly channel: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly deduplicationKey?: string;
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
    if (input.deduplicationKey !== undefined) {
      const existing = this.sent.find((item) => item.payload.deduplicationKey === input.deduplicationKey);
      if (existing) return existing;
    }

    const record = Object.freeze({
      id: `NOTIF-${this.sent.length + 1}`,
      recipientId: input.recipientId,
      template: input.template,
      channel: input.channel,
      payload: Object.freeze({ ...input.payload, ...(input.deduplicationKey ? { deduplicationKey: input.deduplicationKey } : {}) }),
      sentAt: new Date().toISOString(),
    });
    this.sent.push(record);
    return record;
  }
}
