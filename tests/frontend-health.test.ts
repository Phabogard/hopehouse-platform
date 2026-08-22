import assert from 'node:assert/strict';
import test from 'node:test';
import { createHopeHouseServer } from '../src/app.js';
import { getHealthStatus } from '../src/modules/health/health.js';

async function withServer<T>(
  run: (baseUrl: string) => Promise<T>,
  options?: Parameters<typeof createHopeHouseServer>[0],
): Promise<T> {
  const server = createHopeHouseServer(options);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (typeof address !== 'object' || address === null) {
    throw new Error('Adresse serveur invalide');
  }

  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(resolve));
  }
}

test('Health domain module returns valid status and service identification', () => {
  const health = getHealthStatus();
  assert.equal(health.status, 'ok');
  assert.equal(health.service, 'hopehouse-platform');
});

test('GET /health returns HTTP 200 with JSON payload containing status ok and service metadata', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`, {
      headers: { Accept: 'application/json' },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /application\/json/);

    const body = (await response.json()) as {
      status: string;
      service: string;
      data: { status: string; service: string };
    };

    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'hopehouse-platform');
    assert.equal(body.data.status, 'ok');
    assert.equal(body.data.service, 'hopehouse-platform');
  });
});

test('GET / serves index.html with HOPEHOUSE structure and connection indicator', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/);

    const html = await response.text();
    assert.ok(html.includes('HOPEHOUSE'));
    assert.ok(html.includes('id="connection-indicator"'));
    assert.ok(html.includes('id="btn-refresh"'));
    assert.ok(html.includes('GET /health'));
    assert.ok(html.includes('/app.js'));
    assert.ok(html.includes('/styles.css'));
  });
});

test('GET /styles.css serves valid stylesheet', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/styles.css`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/css/);

    const css = await response.text();
    assert.ok(css.includes('--bg-primary'));
    assert.ok(css.includes('.status-connected'));
  });
});

test('GET /app.js serves frontend script that executes fetch /health', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/app.js`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /application\/javascript/);

    const js = await response.text();
    assert.ok(js.includes("fetch('/health'"));
    assert.ok(js.includes('connection-status-text'));
    assert.ok(js.includes('metric-http-status-value'));
  });
});
