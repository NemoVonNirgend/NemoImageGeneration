import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const controller = readFileSync(new URL('../features/automatic-inline-generation.js', import.meta.url), 'utf8');
const prompts = readFileSync(new URL('../features/inline-image-prompts.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.js', import.meta.url), 'utf8');

test('automatic inline generation delegates to the native message paintbrush', () => {
    assert.match(controller, /\.sd_message_gen/);
    assert.match(controller, /button\.click\(\)/);
    assert.match(controller, /enqueueImageGeneration/);
    assert.match(controller, /CHARACTER_MESSAGE_RENDERED/);
    assert.match(controller, /nemo_image_generation/);
    assert.doesNotMatch(controller, /pollinations\/generate|\/api\/sd\/generate/);
});

test('extension owns the fork-compatible hidden prompt protocol', () => {
    assert.match(prompts, /RC_ImageGen/);
    assert.match(prompts, /inline_image_spec/);
    assert.match(prompts, /characterRefs/);
    assert.match(prompts, /setExtensionPrompt/);
});

test('inline generation and Pollinations capture have independent settings', () => {
    for (const setting of ['inlinePromptEnabled', 'autoInlineEnabled', 'inlineImageFrequency', 'inlinePromptStyle', 'pollinationsCaptureEnabled']) {
        assert.match(index, new RegExp(setting));
    }
    assert.match(index, /syncFeatures/);
});
