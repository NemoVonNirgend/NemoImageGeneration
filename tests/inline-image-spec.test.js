import assert from 'node:assert/strict';
import test from 'node:test';
import {
    extractInlineImageSpec,
    inlineImageSpecFingerprint,
    parseInlineImageSpec,
    parseInlineResolution,
    stripDanglingInlineImageBlock,
} from '../core/inline-image-spec.js';

test('parses the fork RC_ImageGen shape and recurring character references', () => {
    const spec = parseInlineImageSpec(JSON.stringify({
        positive_prompt: 'adult woman, red hair, reading beside a window',
        negative_prompt: 'blurry',
        resolution: '1216x832',
        character_references: [{ name: 'Mara', description: 'Adult woman with long red hair.' }],
        details: { lighting: 'warm sunset' },
    }));

    assert.equal(spec.positive, 'adult woman, red hair, reading beside a window');
    assert.equal(spec.negative, 'blurry');
    assert.equal(spec.refs[0].name, 'Mara');
    assert.equal(spec.details.lighting, 'warm sunset');
});

test('extracts metadata while preserving reader-facing prose', () => {
    const result = extractInlineImageSpec(`The room settles into silence.\n\n<RC_ImageGen>\n{"positive_prompt":"quiet library","resolution":"1024x1024"}\n</RC_ImageGen>`);
    assert.equal(result.cleaned, 'The room settles into silence.');
    assert.equal(result.spec.positive, 'quiet library');
});

test('accepts fenced JSON and cleans a dangling interrupted block', () => {
    const parsed = parseInlineImageSpec('```json\n{"positive_prompt":"moonlit harbor"}\n```');
    assert.equal(parsed.positive, 'moonlit harbor');
    assert.equal(stripDanglingInlineImageBlock('Visible prose\n<RC_ImageGen>{"positive_prompt":'), 'Visible prose');
});

test('normalizes requested dimensions and fingerprints meaningful fields', () => {
    assert.deepEqual(parseInlineResolution('2000 × 400'), { width: 1536, height: 512 });
    assert.equal(parseInlineResolution('landscape'), null);

    const first = inlineImageSpecFingerprint({ positive: 'scene', negative: '', resolution: '1024x1024' });
    const same = inlineImageSpecFingerprint({ positive: 'scene', negative: '', resolution: '1024x1024', refs: [] });
    const changed = inlineImageSpecFingerprint({ positive: 'different', negative: '', resolution: '1024x1024' });
    assert.equal(first, same);
    assert.notEqual(first, changed);
});
