import type { DomainEvent } from "./domain-event";

export interface OutboxRepository {
  append<TPayload>(event: DomainEvent<TPayload>): Promise<void>;
  claim(limit: number, now: Date): Promise<readonly DomainEvent[]>;
  markPublished(eventId: string, publishedAt: Date): Promise<void>;
  release(eventId: string, availableAt: Date): Promise<void>;
}
