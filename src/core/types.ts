export type EntityStatus = 'active' | 'inactive' | 'suspended' | 'archived';
export type DraftableStatus = 'draft' | EntityStatus;

export type AuditOutcome = 'success' | 'failure';

export interface AuditLog {
  readonly id: string;
  readonly actorUserId: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly outcome: AuditOutcome;
  readonly occurredAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ApiResponse<T> {
  data: T;
}
