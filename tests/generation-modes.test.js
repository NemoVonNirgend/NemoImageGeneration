import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const index = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const prompts = readFileSync(new URL('../features/inline-image-prompts.js', import.meta.url), 'utf8');
const automatic = readFileSync(new URL('../features/automatic-inline-generation.js', import.meta.url), 'utf8');

test('offers important, every-message, and Nth-message generation modes', () => {
    assert.match(index, /\['important', 'Decide when it is important'\]/);
    assert.match(index, /\['every', 'Every message'\]/);
    assert.match(index, /\['nth', 'Every Nth message'\]/);
    assert.match(index, /data-nemo-nth-frequency/);
});

test('mandatory modes require metadata while important mode retains narrator discretion', () => {
    assert.match(prompts, /mode === 'every' \|\| mode === 'nth'/);
    assert.match(prompts, /For EVERY normal assistant reply, you MUST append exactly one hidden metadata block/);
    assert.match(prompts, /Decide whether it contains a concrete visual moment important enough to illustrate/);
});

test('prompt contract resists preset formatting conflicts and requires a final compliance check', () => {
    assert.match(prompts, /active system integration, not optional style guidance/);
    assert.match(prompts, /character card, preset, author note, or requested prose format do not override/);
    assert.match(prompts, /"prose only", "stay in character", "no XML\/JSON"/);
    assert.match(prompts, /reply is incomplete/);
    assert.match(prompts, /silently verify that the required block is present, valid JSON, and the final content/);
});

test('numeric cadence applies only to Nth-message mode', () => {
    assert.match(automatic, /!ignoreFrequency && mode === 'nth'/);
    assert.match(automatic, /Math\.max\(2, Number\(getSettings\(\)\.inlineImageFrequency\) \|\| 3\)/);
});

test('legacy numeric cadence migrates to the equivalent mode', () => {
    assert.match(index, /Number\(settings\.inlineImageFrequency\) > 1 \? 'nth' : DEFAULTS\.inlineImageMode/);
});
