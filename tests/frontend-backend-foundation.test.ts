import assert from 'node:assert/strict';
import test from 'node:test';
import { createHopeHouseServer } from '../src/app.js';

async function withServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = createHopeHouseServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('Adresse serveur invalide');

  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(resolve));
  }
}

test('1. Backend: GET /health returns HTTP 200 and expected JSON payload', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    const headers = response.headers;
    const body = await response.json() as { status?: string; data?: { status: string; service: string } };

    assert.equal(response.status, 200);
    assert.match(headers.get('content-type') ?? '', /application\/json/);
    assert.equal(body.status, 'ok');
    assert.equal(body.data?.status, 'ok');
    assert.equal(body.data?.service, 'hopehouse-platform');
  });
});

test('2. Frontend: GET / and GET /index.html serve HTML frontend shell', async () => {
  await withServer(async (baseUrl) => {
    for (const path of ['/', '/index.html']) {
      const response = await fetch(`${baseUrl}${path}`);
      const text = await response.text();

      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type') ?? '', /text\/html/);
      assert.match(text, /HOPEHOUSE/);
      assert.match(text, /GET \/health/);
      assert.match(text, /id="status-dot"/);
      assert.match(text, /id="status-text"/);
      assert.match(text, /src="\/app\.js"/);
    }
  });
});

test('3. Frontend: GET /styles.css serves stylesheet with correct MIME type', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/styles.css`);
    const text = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/css/);
    assert.match(text, /--bg-primary/);
    assert.match(text, /\.status-dot/);
  });
});

test('4. Frontend: GET /app.js serves JavaScript client script with fetch logic', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/app.js`);
    const text = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/javascript/);
    assert.match(text, /fetch\('\/health'/);
    assert.match(text, /checkBackendHealth/);
  });
});

test('5. Integration: Frontend HTTP client flow parses real /health backend response', async () => {
  await withServer(async (baseUrl) => {
    const startTime = performance.now();
    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    const elapsedMs = performance.now() - startTime;
    const statusCode = response.status;
    const data = await response.json() as { status?: string; data?: { status: string; service: string } };

    assert.equal(statusCode, 200);
    assert.equal(response.ok, true);
    assert.ok(elapsedMs >= 0);

    const isHealthy = response.ok && (data?.status === 'ok' || data?.data?.status === 'ok');
    assert.equal(isHealthy, true);
    assert.equal(data.status, 'ok');
    assert.equal(data.data?.service, 'hopehouse-platform');
  });
});
