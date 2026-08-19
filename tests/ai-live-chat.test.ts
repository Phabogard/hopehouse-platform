import assert from 'node:assert/strict';
import test from 'node:test';
import { createHopeHouseServer } from '../src/app.js';
import { OpenAiResponsesClient, resolveLiveAiPolicy } from '../src/modules/ai-assistant/openai.js';
import { defaultAiPolicyByRole } from '../src/modules/ai-assistant/index.js';
import type { Actor } from '../src/modules/rbac/authorize.js';

const systemAdmin: Actor = { id: 'admin-1', role: 'system_admin' };

function enabledSystemAdminPolicy() {
  return { ...defaultAiPolicyByRole.system_admin, enabled: true };
}

test('OpenAI Responses provider sends only server-side credentials and returns output text', async () => {
  const previousBaseUrl = process.env.OPENAI_BASE_URL;
  delete process.env.OPENAI_BASE_URL;
  let requestUrl = '';
  let requestBody = '';
  const client = new OpenAiResponsesClient({
    apiKey: 'test-secret',
    model: 'gpt-5.6',
    fetchImpl: async (input, init) => {
      requestUrl = String(input);
      requestBody = String(init?.body ?? '');
      return new Response(JSON.stringify({
        output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Bonjour HopeHouse.' }] }],
      }), { status: 200 });
    },
  });

  try {
    const result = await client.chat(systemAdmin, 'Bonjour', enabledSystemAdminPolicy());

    assert.equal(result.text, 'Bonjour HopeHouse.');
    assert.equal(result.model, 'gpt-5.6');
    assert.equal(requestUrl, 'https://api.openai.com/v1/responses');
    assert.equal(requestBody.includes('test-secret'), false);
    assert.equal(requestBody.includes('Bonjour'), true);
  } finally {
    if (previousBaseUrl === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = previousBaseUrl;
  }
});

test('live AI policy remains disabled by default', () => {
  const previous = process.env.HOPEHOUSE_AI_ENABLED;
  delete process.env.HOPEHOUSE_AI_ENABLED;

  try {
    assert.equal(resolveLiveAiPolicy(systemAdmin).enabled, false);
  } finally {
    if (previous === undefined) delete process.env.HOPEHOUSE_AI_ENABLED;
    else process.env.HOPEHOUSE_AI_ENABLED = previous;
  }
});

test('authenticated /ai/chat route delegates to the configured AI provider', async () => {
  const previous = process.env.HOPEHOUSE_AI_ENABLED;
  process.env.HOPEHOUSE_AI_ENABLED = 'true';

  const server = createHopeHouseServer({
    authRuntime: {
      async login() {
        return { accessToken: null, refreshToken: null, requiresTwoFactor: false, session: null, challenge: null };
      },
      async authenticateAccessToken() {
        return { id: systemAdmin.id, role: systemAdmin.role, sessionId: 'session-1' };
      },
    },
    aiClient: {
      async chat(actor, message, policy) {
        assert.equal(actor.role, 'system_admin');
        assert.equal(message, 'Calcule 2 + 2');
        assert.equal(policy.enabled, true);
        return { text: '4', model: 'test-model' };
      },
    },
  });

  try {
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    assert.equal(typeof address, 'object');
    if (address === null || typeof address === 'string') throw new Error('Adresse serveur invalide');

    const response = await fetch(`http://127.0.0.1:${address.port}/ai/chat`, {
      method: 'POST',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Calcule 2 + 2' }),
    });

    assert.equal(response.status, 200);
    assert.equal(JSON.stringify(await response.json()), JSON.stringify({ data: { text: '4', model: 'test-model' } }));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (previous === undefined) delete process.env.HOPEHOUSE_AI_ENABLED;
    else process.env.HOPEHOUSE_AI_ENABLED = previous;
  }
});
