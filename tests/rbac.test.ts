import assert from 'node:assert/strict';
import test from 'node:test';
import { authorize, can } from '../src/modules/rbac/authorize.js';

test('finance manager can validate payments', () => {
  assert.equal(can({ id: 'u1', role: 'finance_manager' }, 'payments:validate'), true);
});

test('operations agent cannot validate payments', () => {
  assert.equal(can({ id: 'u2', role: 'operations_agent' }, 'payments:validate'), false);
  assert.throws(() => authorize({ id: 'u2', role: 'operations_agent' }, 'payments:validate'), /Permission requise/);
});
