import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenError } from '../src/core/errors.js';
import { authorize, can } from '../src/modules/rbac/authorize.js';
import { permissions, rolePermissions, type Permission, type Role } from '../src/modules/rbac/permissions.js';

const expectedRolePermissions: Record<Role, readonly Permission[]> = {
  system_admin: ['users:read', 'users:manage', 'roles:manage', 'beneficiaries:read', 'services:read', 'subscriptions:read', 'payments:read', 'invoices:read', 'audit:read'],
  business_admin: ['users:read', 'beneficiaries:read', 'beneficiaries:manage', 'services:read', 'services:manage', 'subscriptions:read', 'subscriptions:manage', 'payments:read', 'payments:create', 'invoices:read'],
  operations_agent: ['beneficiaries:read', 'beneficiaries:manage', 'services:read', 'subscriptions:read', 'subscriptions:manage', 'payments:read', 'payments:create', 'invoices:read'],
  finance_manager: ['beneficiaries:read', 'services:read', 'subscriptions:read', 'payments:read', 'payments:create', 'payments:validate', 'invoices:read', 'invoices:manage', 'accounting:export'],
  accountant: ['payments:read', 'invoices:read', 'accounting:export'],
  auditor: ['audit:read'],
};

test('RBAC matrix grants only explicitly configured permissions per role', () => {
  for (const [role, expectedPermissions] of Object.entries(expectedRolePermissions) as Array<[Role, readonly Permission[]]>) {
    for (const permission of permissions) {
      assert.equal(can({ id: `${role}-user`, role }, permission), expectedPermissions.includes(permission), `${role} / ${permission}`);
    }
  }
});

test('finance manager can validate payments', () => {
  assert.equal(can({ id: 'u1', role: 'finance_manager' }, 'payments:validate'), true);
  authorize({ id: 'u1', role: 'finance_manager' }, 'payments:validate');
});

test('operations agent cannot validate payments', () => {
  assert.equal(can({ id: 'u2', role: 'operations_agent' }, 'payments:validate'), false);
  assert.throws(() => authorize({ id: 'u2', role: 'operations_agent' }, 'payments:validate'), /Permission requise/);
});

test('auditor can read audit logs but cannot read payments', () => {
  assert.equal(can({ id: 'auditor-1', role: 'auditor' }, 'audit:read'), true);
  assert.equal(can({ id: 'auditor-1', role: 'auditor' }, 'payments:read'), false);
  assert.throws(() => authorize({ id: 'auditor-1', role: 'auditor' }, 'payments:read'), /Permission requise/);
});

test('forbidden authorization errors use the domain forbidden status code', () => {
  try {
    authorize({ id: 'accountant-1', role: 'accountant' }, 'payments:validate');
  } catch (error) {
    assert.equal(error instanceof ForbiddenError, true);
    assert.equal((error as ForbiddenError).statusCode, 403);
    assert.equal((error as ForbiddenError).code, 'FORBIDDEN');
    return;
  }

  throw new Error('Expected authorization to fail');
});
