import type { DomainEventEnvelope } from "../../core/events/domain-event";
import type { OutboxMessage, OutboxStore } from "../../core/outbox/outbox";

type SqlExecutor = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
};

/**
 * PostgreSQL adapter for the shared Outbox contract.
 *
 * The adapter deliberately depends on a minimal SQL executor instead of the
 * generated Prisma model so the domain contract stays infrastructure-neutral.
 * The application can pass PrismaClient or a Prisma transaction client.
 */
export class PostgresOutboxStore<TPayload = unknown>
  implements OutboxStore<TPayload>
{
  constructor(private readonly db: SqlExecutor) {}

  async claimBatch(limit: number, now: Date): Promise<OutboxMessage<TPayload>[]> {
    const rows = await this.db.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `
      WITH candidates AS (
        SELECT id
        FROM outbox_messages
        WHERE published_at IS NULL
          AND available_at <= $1
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT $2
      )
      SELECT o.*
      FROM outbox_messages o
      INNER JOIN candidates c ON c.id = o.id
      ORDER BY o.created_at
      `,
      now,
      limit,
    );

    return rows.map((row) => this.toMessage(row));
  }

  async markPublished(eventId: string, publishedAt: Date): Promise<void> {
    await this.db.$queryRawUnsafe(
      `
      UPDATE outbox_messages
      SET published_at = $2,
          last_error = NULL
      WHERE id = $1
        AND published_at IS NULL
      `,
      eventId,
      publishedAt,
    );
  }

  async markFailed(eventId: string, error: Error, nextAttemptAt: Date): Promise<void> {
    await this.db.$queryRawUnsafe(
      `
      UPDATE outbox_messages
      SET attempts = attempts + 1,
          available_at = $2,
          last_error = $3
      WHERE id = $1
        AND published_at IS NULL
      `,
      eventId,
      nextAttemptAt,
      error.message.slice(0, 2000),
    );
  }

  private toMessage(row: Record<string, unknown>): OutboxMessage<TPayload> {
    const payload = row.payload_json as TPayload;
    const required = (key: string): string => {
      const value = row[key];
      if (typeof value !== "string") {
        throw new Error(`Invalid outbox row: ${key} must be a string`);
      }
      return value;
    };

    return {
      eventId: required("id"),
      eventType: required("event_type"),
      schemaVersion: Number(row.schema_version),
      occurredAt: required("created_at"),
      correlationId: required("correlation_id"),
      causationId: row.causation_id === null ? null : String(row.causation_id),
      aggregateId: required("aggregate_id"),
      aggregateType: required("aggregate_type"),
      payload,
      attempts: Number(row.attempts),
      availableAt: required("available_at"),
      publishedAt: row.published_at === null ? null : String(row.published_at),
      lastError: row.last_error === null ? null : String(row.last_error),
    };
  }
}

export function toOutboxInsert(event: DomainEventEnvelope): {
  eventId: string;
  eventType: string;
  schemaVersion: number;
  correlationId: string;
  causationId: string | null;
  aggregateId: string;
  aggregateType: string;
  payloadJson: unknown;
} {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    schemaVersion: event.schemaVersion,
    correlationId: event.correlationId,
    causationId: event.causationId,
    aggregateId: event.aggregateId,
    aggregateType: event.aggregateType,
    payloadJson: event.payload,
  };
}
