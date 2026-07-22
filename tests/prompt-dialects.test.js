import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const index = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const prompts = readFileSync(new URL('../features/inline-image-prompts.js', import.meta.url), 'utf8');

test('offers provider-neutral mixed prompts separately from Anima mixed prompts', () => {
    assert.match(index, /\['mixed', 'Mixed tags \+ prose'\]/);
    assert.match(index, /\['anima', 'Anima mixed tags \+ prose'\]/);
    assert.match(prompts, /dialect === 'mixed'/);
    assert.match(prompts, /provider-neutral mixed prompt/);
});
