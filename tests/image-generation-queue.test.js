import assert from 'node:assert/strict';
import test from 'node:test';
import { enqueueImageGeneration, imageGenerationPending } from '../core/image-generation-queue.js';

test('serializes image jobs and keeps the queue usable after a rejection', async () => {
    const order = [];
    let releaseFirst;
    const gate = new Promise(resolve => { releaseFirst = resolve; });

    const first = enqueueImageGeneration(async () => {
        order.push('first:start');
        await gate;
        order.push('first:end');
    });
    const second = enqueueImageGeneration(async () => {
        order.push('second:start');
        throw new Error('expected');
    });
    const third = enqueueImageGeneration(async () => {
        order.push('third:start');
        return 3;
    });

    await Promise.resolve();
    assert.deepEqual(order, ['first:start']);
    assert.equal(imageGenerationPending(), 3);
    releaseFirst();

    await first;
    await assert.rejects(second, /expected/);
    assert.equal(await third, 3);
    assert.deepEqual(order, ['first:start', 'first:end', 'second:start', 'third:start']);
    assert.equal(imageGenerationPending(), 0);
});
