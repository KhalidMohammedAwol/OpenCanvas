import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { IndexedDbQueueStore, nextRetryAt } from '../src/queue.ts';

test('committed writes resolve and survive a new store instance', { timeout: 2000 }, async () => {
  const store = new IndexedDbQueueStore();
  const operation = { operationId: 'committed', captureId: 'capture', payload: {}, status: 'pending', attempts: 0, nextAttemptAt: 0, createdAt: '2026-10-08T00:00:00Z' };
  await store.put(operation);
  assert.deepEqual(await new IndexedDbQueueStore().getPending(), [operation]);
  await store.markFailed(operation.operationId, 'offline', Date.now() + 60000);
  assert.deepEqual(await store.getPending(), []);
  const retried = await store.getPending(Date.now() + 120000);
  assert.equal(retried[0].attempts, 1);
  assert.equal(retried[0].lastError, 'offline');
  await store.markDelivered(operation.operationId);
  assert.deepEqual(await new IndexedDbQueueStore().getPending(Date.now() + 120000), []);
});

test('invalid storage writes reject instead of hanging', { timeout: 2000 }, async () => {
  await assert.rejects(new IndexedDbQueueStore().put({ payload: () => {} }));
});

test('production retry backoff includes bounded jitter', () => {
  for (const attempts of [0, 3, 20]) {
    const delay = Math.min(900000, 1000 * 2 ** Math.min(attempts, 10));
    const retry = nextRetryAt(attempts, 1000000);
    assert.ok(retry >= 1000000 + delay && retry < 1000000 + delay + 500);
  }
});
