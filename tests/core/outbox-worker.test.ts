import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OutboxWorker } from '../../src/core/outbox/outbox-worker.js';

describe('OutboxWorker', () => {
  it('does not start more than one processing loop', async () => {
    let calls = 0;
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });

    const worker = new OutboxWorker({
      async processBatch() {
        calls += 1;
        await blocked;
        return 1;
      },
    }, { intervalMs: 10 });

    worker.start();
    worker.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(calls, 1);

    release();
    await worker.stop();
    assert.equal(worker.isRunning, false);
  });

  it('continues scheduling after a batch error', async () => {
    let calls = 0;
    let errors = 0;

    const worker = new OutboxWorker({
      async processBatch() {
        calls += 1;
        if (calls === 1) throw new Error('temporary database failure');
        return 1;
      },
    }, {
      intervalMs: 1,
      onError: () => {
        errors += 1;
      },
    });

    worker.start();
    await new Promise((resolve) => setTimeout(resolve, 15));
    await worker.stop();

    assert.ok(calls >= 2);
    assert.equal(errors, 1);
  });

  it('supports explicit single-batch processing without starting the loop', async () => {
    let calls = 0;
    const worker = new OutboxWorker({
      async processBatch() {
        calls += 1;
        return 7;
      },
    });

    assert.equal(await worker.processOnce(), 7);
    assert.equal(calls, 1);
    assert.equal(worker.isRunning, false);
  });
});
