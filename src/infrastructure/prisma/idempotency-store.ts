import type { IdempotencyRecord, IdempotencyStore } from '../../core/idempotency/idempotency.js';
import { parseDomainDate, toDomainIso } from './mappers.js';

type PrismaIdempotencyRow = {
  readonly key: string;
  readonly operation: string;
  readonly result_reference: string | null;
  readonly created_at: Date | string;
};

export interface PrismaIdempotencyClient {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: readonly unknown[]): Promise<T>;
  $executeRaw(query: TemplateStringsArray, ...values: readonly unknown[]): Promise<number>;
}

function toDomain(row: PrismaIdempotencyRow): IdempotencyRecord {
  return Object.freeze({
    key: row.key,
    operation: row.operation,
    resultReference: row.result_reference ?? undefined,
    createdAt: toDomainIso(row.created_at),
  });
}

export class PostgresIdempotencyStore implements IdempotencyStore {
  constructor(private readonly client: PrismaIdempotencyClient) {}

  async find(key: string, operation: string): Promise<IdempotencyRecord | null> {
    const rows = await this.client.$queryRaw<readonly PrismaIdempotencyRow[]>`
      SELECT "key", "operation", "result_reference", "created_at"
      FROM "idempotency_records"
      WHERE "key" = ${key} AND "operation" = ${operation}
      LIMIT 1
    `;

    const row = rows[0];
    return row === undefined ? null : toDomain(row);
  }

  async save(record: IdempotencyRecord): Promise<void> {
    const createdAt = parseDomainDate(record.createdAt, 'idempotency record creation');

    await this.client.$executeRaw`
      INSERT INTO "idempotency_records" ("key", "operation", "result_reference", "created_at")
      VALUES (${record.key}, ${record.operation}, ${record.resultReference ?? null}, ${createdAt})
      ON CONFLICT ("key", "operation") DO NOTHING
    `;
  }
}
