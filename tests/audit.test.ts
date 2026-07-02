import assert from 'node:assert/strict';
import test from 'node:test';
import { AuditLogService } from '../src/modules/audit/audit-log.js';

test('audit entries and metadata are immutable after recording', () => {
  const audit = new AuditLogService();
  const entry = audit.record({
    actorUserId: 'u1',
    action: 'beneficiary.create',
    entityType: 'beneficiary',
    entityId: 'BEN-001',
    outcome: 'success',
    metadata: { reference: 'BEN-001' },
  });

  assert.throws(() => {
    (entry as { action: string }).action = 'payment.create';
  });
  assert.throws(() => {
    (entry.metadata as Record<string, unknown>).reference = 'BEN-002';
  });
  assert.equal(entry.action, 'beneficiary.create');
  assert.equal(entry.metadata.reference, 'BEN-001');
});

test('audit list cannot be used to mutate the audit log collection', () => {
  const audit = new AuditLogService();
  audit.record({
    actorUserId: 'u1',
    action: 'payment.create',
    entityType: 'payment',
    entityId: 'PAY-001',
    outcome: 'success',
  });

  const entries = audit.list();
  assert.throws(() => {
    (entries as unknown[]).push({});
  });
  assert.equal(audit.list().length, 1);
});
