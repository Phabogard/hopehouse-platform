import test from 'node:test';
import assert from 'node:assert/strict';
import { AiToolGateway, assertSafeAiPolicy, defaultAiPolicyByRole, type AiToolDefinition } from '../src/modules/ai-assistant/index.js';
import type { Actor } from '../src/modules/rbac/authorize.js';

const systemAdmin: Actor = { id: 'admin-1', role: 'system_admin' };
const auditor: Actor = { id: 'auditor-1', role: 'auditor' };

const readTool: AiToolDefinition<{ query: string }, { ok: boolean }> = {
  name: 'search_authorized_data',
  description: 'Recherche des données déjà autorisées par le backend.',
  riskLevel: 'L0',
  requiredPermissions: ['users:read'],
  async execute(input) {
    return { ok: input.query.length > 0 };
  },
};

const sensitiveTool: AiToolDefinition<undefined, { ok: true }> = {
  name: 'sensitive_action',
  description: 'Action sensible de démonstration.',
  riskLevel: 'L3',
  requiredPermissions: ['users:manage'],
  async execute() {
    return { ok: true };
  },
};

test('AI tool gateway denies disabled policies', async () => {
  const gateway = new AiToolGateway();
  gateway.register(readTool);

  const result = await gateway.execute(
    { toolName: readTool.name, input: { query: 'users' } },
    { actor: systemAdmin, sessionId: 's1', requestId: 'r1', approved: false },
    defaultAiPolicyByRole.system_admin,
  );

  assert.equal(result.status, 'denied');
});

test('AI tool gateway requires human approval for L3', async () => {
  const gateway = new AiToolGateway();
  gateway.register(sensitiveTool);
  const policy = {
    ...defaultAiPolicyByRole.system_admin,
    enabled: true,
    maxRiskLevel: 'L3' as const,
    allowedTools: [sensitiveTool.name],
  };

  const pending = await gateway.execute(
    { toolName: sensitiveTool.name, input: undefined },
    { actor: systemAdmin, sessionId: 's2', requestId: 'r2', approved: false },
    policy,
  );
  assert.equal(pending.status, 'approval_required');

  const executed = await gateway.execute(
    { toolName: sensitiveTool.name, input: undefined },
    { actor: systemAdmin, sessionId: 's2', requestId: 'r3', approved: true },
    policy,
  );
  assert.equal(executed.status, 'executed');
  assert.equal(JSON.stringify(executed.result), JSON.stringify({ ok: true }));
});

test('AI tool gateway preserves server RBAC', async () => {
  const gateway = new AiToolGateway();
  gateway.register(readTool);
  const policy = {
    ...defaultAiPolicyByRole.auditor,
    enabled: true,
    allowedTools: [readTool.name],
  };

  const result = await gateway.execute(
    { toolName: readTool.name, input: { query: 'users' } },
    { actor: auditor, sessionId: 's3', requestId: 'r4', approved: false },
    policy,
  );

  assert.equal(result.status, 'denied');
});

test('AI policy validation rejects unsafe limits', () => {
  assert.throws(() => assertSafeAiPolicy({
    ...defaultAiPolicyByRole.system_admin,
    maxActionsPerSession: 0,
  }));
  assert.throws(() => assertSafeAiPolicy({
    ...defaultAiPolicyByRole.system_admin,
    maxFinancialAmountCents: -1,
  }));
});