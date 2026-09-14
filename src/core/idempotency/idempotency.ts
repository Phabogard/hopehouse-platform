export interface IdempotencyRecord {
  readonly key: string;
  readonly operation: string;
  readonly resultReference?: string;
  readonly createdAt: string;
}

export interface IdempotencyStore {
  find(key: string, operation: string): Promise<IdempotencyRecord | null>;

  /**
   * Atomically inserts the record.
   *
   * Returns `true` if this call actually inserted the row (i.e. this call
   * won the race for `(key, operation)`), or `false` if a row already
   * existed for `(key, operation)` (i.e. this call lost the race — nothing
   * was written).
   *
   * Implementations MUST use a single atomic statement equivalent to
   * `INSERT ... ON CONFLICT (key, operation) DO NOTHING RETURNING ...` and
   * report success based on whether a row was actually returned. A
   * `find()` followed by a conditional `insert()` is NOT an acceptable
   * implementation: it reintroduces the exact race condition this method
   * exists to prevent.
   */
  save(record: IdempotencyRecord): Promise<boolean>;
}
