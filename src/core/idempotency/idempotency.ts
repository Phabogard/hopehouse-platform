export interface IdempotencyRecord {
  readonly key: string;
  readonly operation: string;
  readonly resultReference?: string;
  readonly createdAt: string;
}

export interface IdempotencyStore {
  find(key: string, operation: string): Promise<IdempotencyRecord | null>;
  save(record: IdempotencyRecord): Promise<void>;
}
