import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
test('owns persistent image-generation settings and gates initialization', () => {
    assert.match(source, /extension_settings\.NemoImageGeneration/);
    assert.match(source, /settings\.enabled/);
    assert.match(source, /data-setting="enabled"/);
    assert.match(source, /saveSettingsDebounced/);
    assert.match(source, /new MutationObserver/);
    assert.match(source, /nemo-image-generation-settings/);
});
