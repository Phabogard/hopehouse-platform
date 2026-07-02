import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { permissions, rolePermissions } from '../src/modules/rbac/permissions.js';

function readProjectFile(path: string): string {
  return readFileSync(path, 'utf8');
}

test('business domains are represented in docs, SQL schema, and API contract', () => {
  const businessRules = readProjectFile('docs/business/document-001-cahier-regles-metier.md');
  const schema = readProjectFile('database/schema.sql');
  const openApi = readProjectFile('docs/api/openapi.yaml');

  for (const domain of ['Utilisateurs', 'Bénéficiaires', 'Services', 'Abonnements', 'Paiements', 'Factures', 'Audit']) {
    assert.equal(businessRules.includes(domain), true, domain);
  }

  for (const table of ['users', 'beneficiaries', 'services', 'subscriptions', 'payments', 'invoices', 'audit_logs']) {
    assert.equal(schema.includes(`CREATE TABLE ${table}`), true, table);
  }

  for (const path of ['/users', '/beneficiaries', '/services', '/subscriptions', '/payments', '/invoices', '/audit-logs']) {
    assert.equal(openApi.includes(`  ${path}:`), true, path);
  }
});

test('documented RBAC permissions stay synchronized with TypeScript permissions', () => {
  const matrix = readProjectFile('docs/design/matrice-rbac.md');

  for (const permission of permissions) {
    assert.equal(matrix.includes(`| ${permission} |`), true, permission);
  }

  for (const configuredPermissions of Object.values(rolePermissions)) {
    for (const permission of configuredPermissions) {
      assert.equal(permissions.includes(permission), true, permission);
    }
  }
});

test('OpenAPI create request schemas match currently implemented API create routes', () => {
  const openApi = readProjectFile('docs/api/openapi.yaml');
  const app = readProjectFile('src/app.ts');

  assert.equal(openApi.includes('CreateBeneficiaryRequest'), true);
  assert.equal(openApi.includes('CreatePaymentRequest'), true);
  assert.equal(app.includes("request.method === 'POST' && url.pathname === '/beneficiaries'"), true);
  assert.equal(app.includes("request.method === 'POST' && url.pathname === '/payments'"), true);
});

test('SQL status constraints include the statuses emitted by domain factories', () => {
  const schema = readProjectFile('database/schema.sql');

  assert.equal(schema.includes("status IN ('active', 'inactive', 'suspended', 'archived')"), true);
  assert.equal(schema.includes("status IN ('draft', 'active', 'suspended', 'archived')"), true);
  assert.equal(schema.includes("status IN ('draft', 'active', 'suspended', 'terminated', 'expired', 'archived')"), true);
  assert.equal(schema.includes("status IN ('initiated', 'pending', 'succeeded', 'failed', 'cancelled', 'refunded', 'partially_refunded', 'reconciled')"), true);
  assert.equal(schema.includes("status IN ('draft', 'issued', 'partially_paid', 'paid', 'cancelled', 'overdue', 'archived')"), true);
});
