import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const prompts = readFileSync(new URL('../features/inline-image-prompts.js', import.meta.url), 'utf8');

test('fork inline mode receives a concise compliance guard without a duplicate schema', () => {
    assert.match(prompts, /power_user\.image_prompt_mode === 'inline' && generationMode\(\) === 'important'/);
    assert.match(prompts, /forkOwnsInjection\s*\?\s*buildForkComplianceGuard\(\)/);
    assert.match(prompts, /Use the exact RC_ImageGen schema supplied by the NemoTavern inline-image directive/);
    assert.match(prompts, /Append exactly one block, never a second block/);
});
