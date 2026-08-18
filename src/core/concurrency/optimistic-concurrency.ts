export interface VersionedAggregate {
  readonly version: number;
}

export class ConcurrencyConflictError extends Error {
  constructor(
    public readonly expectedVersion: number,
    public readonly actualVersion: number,
  ) {
    super(
      `Optimistic concurrency conflict: expected version ${expectedVersion}, actual version ${actualVersion}`,
    );
    this.name = "ConcurrencyConflictError";
  }
}

export function assertExpectedVersion(
  expectedVersion: number,
  actualVersion: number,
): void {
  if (expectedVersion !== actualVersion) {
    throw new ConcurrencyConflictError(expectedVersion, actualVersion);
  }
}
