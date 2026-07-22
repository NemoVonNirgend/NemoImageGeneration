import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const prompts = readFileSync(new URL('../features/inline-image-prompts.js', import.meta.url), 'utf8');

test('mandatory modes strengthen the fork prompt instead of yielding to its optional instruction', () => {
    assert.match(prompts, /power_user\.image_prompt_mode === 'inline' && generationMode\(\) === 'important'/);
});
