import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const index = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const automatic = readFileSync(new URL('../features/automatic-inline-generation.js', import.meta.url), 'utf8');

test('migrates and disables the fork Scene Images click owner before starting Nemo cadence', () => {
    assert.match(index, /const forkSceneImages = power_user\.scene_images/);
    assert.match(index, /settings\.inlineImageMode = settings\.inlineImageFrequency > 1 \? 'nth' : 'every'/);
    assert.match(index, /power_user\.scene_images\.enabled = false/);
    assert.doesNotMatch(automatic, /if \(power_user\.scene_images\?\.enabled\) return/);
});
