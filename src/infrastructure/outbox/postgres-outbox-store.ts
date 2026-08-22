import type { DomainEventEnvelope } from "../../core/events/domain-event.js";
import type { OutboxMessage, OutboxStore } from "../../core/outbox/outbox.js";

type SqlExecutor = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
};

/** PostgreSQL adapter. The caller may provide PrismaClient or a transaction client. */
export class PostgresOutboxStore<TPayload = unknown>
  implements OutboxStore<TPayload>
{
  constructor(private readonly db: SqlExecutor) {}

  async append(event: DomainEventEnvelope<TPayload>, availableAt = new Date(event.occurredAt)): Promise<void> {
    if (Number.isNaN(availableAt.getTime())) {
      throw new Error("Invalid outbox availableAt timestamp");
    }

    const insert = toOutboxInsert(event);
    const occurredAt = new Date(event.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) {
      throw new Error("Invalid outbox occurredAt timestamp");
    }

    await this.db.$queryRawUnsafe(
      `
      INSERT INTO outbox_messages (
        id,
        event_type,
        schema_version,
        occurred_at,
        correlation_id,
        causation_id,
        aggregate_id,
        aggregate_type,
        payload_json,
        available_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
      `,
      insert.eventId,
      insert.eventType,
      insert.schemaVersion,
      occurredAt,
      insert.correlationId,
      insert.causationId,
      insert.aggregateId,
      insert.aggregateType,
      JSON.stringify(insert.payloadJson),
      availableAt,
    );
  }

  async claimBatch(
    limit: number,
    now: Date,
    workerId: string,
    leaseMs: number,
  ): Promise<OutboxMessage<TPayload>[]> {
    const rows = await this.db.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `
      WITH candidates AS (
        SELECT id
        FROM outbox_messages
        WHERE published_at IS NULL
          AND available_at <= $1
          AND (lease_until IS NULL OR lease_until <= $1)
        ORDER BY created_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT $2
      )
      UPDATE outbox_messages o
      SET lease_owner = $3,
          lease_until = $1 + ($4 * INTERVAL '1 millisecond')
      FROM candidates c
      WHERE o.id = c.id
      RETURNING o.*
      `,
      now,
      limit,
      workerId,
      leaseMs,
    );

    return rows.map((row) => this.toMessage(row));
  }

  async markPublished(
    eventId: string,
    workerId: string,
    publishedAt: Date,
  ): Promise<void> {
    await this.db.$queryRawUnsafe(
      `
      UPDATE outbox_messages
      SET published_at = $3,
          last_error = NULL,
          lease_owner = NULL,
          lease_until = NULL
      WHERE id = $1
        AND published_at IS NULL
        AND lease_owner = $2
      `,
      eventId,
      workerId,
      publishedAt,
    );
  }

  async markFailed(
    eventId: string,
    workerId: string,
    error: Error,
    nextAttemptAt: Date,
  ): Promise<void> {
    await this.db.$queryRawUnsafe(
      `
      UPDATE outbox_messages
      SET attempts = attempts + 1,
          available_at = $3,
          last_error = $4,
          lease_owner = NULL,
          lease_until = NULL
      WHERE id = $1
        AND published_at IS NULL
        AND lease_owner = $2
      `,
      eventId,
      workerId,
      nextAttemptAt,
      error.message.slice(0, 2000),
    );
  }

  private toMessage(row: Record<string, unknown>): OutboxMessage<TPayload> {
    const stringValue = (key: string): string => {
      const value = row[key];
      if (typeof value !== "string") {
        throw new Error(`Invalid outbox row: ${key} must be a string`);
      }
      return value;
    };

    const dateValue = (key: string): string => {
      const value = row[key];
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (typeof value === "string") {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) {
          return date.toISOString();
        }
      }
      throw new Error(`Invalid outbox row: ${key} must be a timestamp`);
    };

    const nullableDateValue = (key: string): string | null => {
      const value = row[key];
      return value === null || value === undefined ? null : dateValue(key);
    };

    return {
      eventId: stringValue("id"),
      eventType: stringValue("event_type"),
      schemaVersion: Number(row.schema_version),
      occurredAt: dateValue("occurred_at"),
      correlationId: stringValue("correlation_id"),
      causationId: row.causation_id === null ? null : String(row.causation_id),
      aggregateId: stringValue("aggregate_id"),
      aggregateType: stringValue("aggregate_type"),
      payload: row.payload_json as TPayload,
      attempts: Number(row.attempts),
      availableAt: dateValue("available_at"),
      publishedAt: nullableDateValue("published_at"),
      lastError: row.last_error === null ? null : String(row.last_error),
      leaseOwner: row.lease_owner === null ? null : String(row.lease_owner),
      leaseUntil: nullableDateValue("lease_until"),
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
