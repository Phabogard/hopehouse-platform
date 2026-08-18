import type { DomainEventEnvelope } from "../events/domain-event.js";

export interface OutboxMessage<TPayload = unknown> extends DomainEventEnvelope<TPayload> {
  readonly attempts: number;
  readonly availableAt: string;
  readonly publishedAt: string | null;
  readonly lastError: string | null;
  readonly leaseOwner: string | null;
  readonly leaseUntil: string | null;
}

export interface OutboxStore<TPayload = unknown> {
  claimBatch(
    limit: number,
    now: Date,
    workerId: string,
    leaseMs: number,
  ): Promise<OutboxMessage<TPayload>[]>;
  markPublished(eventId: string, workerId: string, publishedAt: Date): Promise<void>;
  markFailed(
    eventId: string,
    workerId: string,
    error: Error,
    nextAttemptAt: Date,
  ): Promise<void>;
}

export interface EventPublisher<TPayload = unknown> {
  publish(event: DomainEventEnvelope<TPayload>): Promise<void>;
}

export interface OutboxRelayOptions {
  readonly batchSize?: number;
  readonly baseBackoffMs?: number;
  readonly leaseMs?: number;
  readonly workerId: string;
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
    private readonly options: OutboxRelayOptions,
  ) {}

  async processBatch(now = new Date()): Promise<number> {
    const batchSize = this.options.batchSize ?? 50;
    const baseBackoffMs = this.options.baseBackoffMs ?? 1_000;
    const leaseMs = this.options.leaseMs ?? 30_000;
    const messages = await this.store.claimBatch(
      batchSize,
      now,
      this.options.workerId,
      leaseMs,
    );
    let published = 0;

    for (const message of messages) {
      try {
        await this.publisher.publish(message);
        await this.store.markPublished(message.eventId, this.options.workerId, now);
        published += 1;
      } catch (error) {
        const nextAttempt = new Date(
          now.getTime() + calculateExponentialBackoff(message.attempts, baseBackoffMs),
        );
        await this.store.markFailed(
          message.eventId,
          this.options.workerId,
          error instanceof Error ? error : new Error(String(error)),
          nextAttempt,
        );
      }
    }

    return published;
  }
}
