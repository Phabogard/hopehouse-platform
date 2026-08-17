import type { DomainEventEnvelope } from "../events/domain-event";

export interface OutboxMessage<TPayload = unknown> extends DomainEventEnvelope<TPayload> {
  readonly attempts: number;
  readonly availableAt: string;
  readonly publishedAt: string | null;
  readonly lastError: string | null;
}

export interface OutboxStore<TPayload = unknown> {
  claimBatch(limit: number, now: Date): Promise<OutboxMessage<TPayload>[]>;
  markPublished(eventId: string, publishedAt: Date): Promise<void>;
  markFailed(eventId: string, error: Error, nextAttemptAt: Date): Promise<void>;
}

export interface EventPublisher<TPayload = unknown> {
  publish(event: DomainEventEnvelope<TPayload>): Promise<void>;
}

export interface OutboxRelayOptions {
  readonly batchSize?: number;
  readonly maxAttempts?: number;
  readonly baseBackoffMs?: number;
}

export function calculateExponentialBackoff(
  attempts: number,
  baseBackoffMs = 1_000,
): number {
  const exponent = Math.max(0, Math.min(attempts, 10));
  return baseBackoffMs * 2 ** exponent;
}

export class OutboxRelay<TPayload = unknown> {
  constructor(
    private readonly store: OutboxStore<TPayload>,
    private readonly publisher: EventPublisher<TPayload>,
    private readonly options: OutboxRelayOptions = {},
  ) {}

  async processBatch(now = new Date()): Promise<number> {
    const batchSize = this.options.batchSize ?? 50;
    const maxAttempts = this.options.maxAttempts ?? 10;
    const baseBackoffMs = this.options.baseBackoffMs ?? 1_000;
    const messages = await this.store.claimBatch(batchSize, now);
    let published = 0;

    for (const message of messages) {
      try {
        await this.publisher.publish(message);
        await this.store.markPublished(message.eventId, now);
        published += 1;
      } catch (error) {
        const nextAttempt = new Date(
          now.getTime() + calculateExponentialBackoff(message.attempts, baseBackoffMs),
        );
        if (message.attempts < maxAttempts) {
          await this.store.markFailed(
            message.eventId,
            error instanceof Error ? error : new Error(String(error)),
            nextAttempt,
          );
        }
      }
    }

    return published;
  }
}
