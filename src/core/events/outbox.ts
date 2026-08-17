import type { DomainEvent } from "./domain-event";

export interface OutboxMessage<TPayload = unknown> {
  readonly id: string;
  readonly event: DomainEvent<TPayload>;
  readonly attempts: number;
  readonly availableAt: string;
  readonly publishedAt: string | null;
}

export interface OutboxStore {
  append<TPayload>(message: OutboxMessage<TPayload>): Promise<void>;
  claim(limit: number, now: Date): Promise<readonly OutboxMessage[]>;
  markPublished(id: string, publishedAt: Date): Promise<void>;
  release(id: string, availableAt: Date): Promise<void>;
}
