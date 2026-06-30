export type EntityStatus = 'active' | 'inactive' | 'suspended' | 'archived';
export type DraftableStatus = 'draft' | EntityStatus;

export type AuditOutcome = 'success' | 'failure';

export interface AuditLog {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  outcome: AuditOutcome;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

export interface ApiResponse<T> {
  data: T;
}
