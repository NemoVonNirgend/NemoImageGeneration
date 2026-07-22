import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const prompts = readFileSync(new URL('../features/inline-image-prompts.js', import.meta.url), 'utf8');

test('message updates clear Nemo-owned prompt metadata when the block is removed', () => {
    assert.match(prompts, /clearCachedOnMissing = false/);
    assert.match(prompts, /MESSAGE_UPDATED[\s\S]*clearCachedOnMissing: true/);
    for (const field of ['inline_image_spec', 'title', 'negative', 'nemo_image_generation']) {
        assert.match(prompts, new RegExp(`delete message\\.extra\\.${field}`));
    }
});
