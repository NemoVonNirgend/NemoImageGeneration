import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const automatic = readFileSync(new URL('../features/automatic-inline-generation.js', import.meta.url), 'utf8');
const prompts = readFileSync(new URL('../features/inline-image-prompts.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.js', import.meta.url), 'utf8');

test('queued jobs are bound to the originating swipe, spec, and state object', () => {
    assert.match(automatic, /swipeId: message\.swipe_id/);
    assert.match(automatic, /job\.message\.swipe_id !== job\.swipeId/);
    assert.match(automatic, /job\.message\.extra\?\.nemo_image_generation !== job\.state/);
    assert.match(automatic, /inlineImageSpecFingerprint\(job\.message\.extra\?\.inline_image_spec\) === job\.fingerprint/);
    assert.match(automatic, /if \(!isCurrentJob\(job\)\).*stale while queued/);
});

test('cached specs do not prevent a newly supplied block from being reparsed', () => {
    const extractPosition = prompts.indexOf('const result = extractInlineImageSpec(message.mes)');
    const cachedPosition = prompts.indexOf("return message.extra?.inline_image_spec?.positive ? message.extra.inline_image_spec : null");
    assert.ok(extractPosition >= 0);
    assert.ok(cachedPosition > extractPosition);
});

test('automatic capture remains initialized when prompt injection is disabled', () => {
    assert.match(index, /settings\.inlinePromptEnabled \|\| settings\.autoInlineEnabled/);
    assert.match(prompts, /settings\.inlinePromptEnabled !== false \|\| settings\.autoInlineEnabled !== false/);
    assert.match(prompts, /function isInjectionActive/);
});
