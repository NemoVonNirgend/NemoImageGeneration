const NAME_PATTERN = 'rc[-_\\s]*image[-_\\s]*gen';

function blockRegex() {
    return new RegExp(`<\\s*${NAME_PATTERN}\\s*>([\\s\\S]*?)<\\s*\\/+\\s*${NAME_PATTERN}\\s*>`, 'gi');
}

/** Parse an RC_ImageGen JSON payload into Nemo's provider-neutral shape. */
export function parseInlineImageSpec(raw) {
    let source = String(raw || '').trim();
    source = source.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    let value = null;
    try {
        value = JSON.parse(source);
    } catch {
        const object = source.match(/\{[\s\S]*\}/);
        if (object) {
            try {
                value = JSON.parse(object[0]);
            } catch {
                // Fall through to the tolerant positive-prompt extractor.
            }
        }
    }

    if (!value || typeof value !== 'object') {
        const prompt = source.match(/"?positive_prompt"?\s*:\s*"((?:[^"\\]|\\.)*)"/i);
        if (!prompt) return null;
        value = { positive_prompt: prompt[1] };
    }

    const positive = String(value.positive_prompt ?? value.prompt ?? '').trim();
    if (!positive) return null;

    const rawRefs = Array.isArray(value.character_references)
        ? value.character_references
        : (value.character_reference ? [value.character_reference] : []);
    const refs = rawRefs
        .filter(reference => reference?.name)
        .map(reference => ({
            name: String(reference.name).trim(),
            description: String(reference.description ?? '').trim(),
        }))
        .filter(reference => reference.name);

    return {
        positive,
        negative: String(value.negative_prompt ?? value.negative ?? '').trim(),
        resolution: String(value.resolution ?? '').trim(),
        refs,
        details: value.details && typeof value.details === 'object' && !Array.isArray(value.details)
            ? value.details
            : null,
    };
}

function stripBlocks(content) {
    return content
        .replace(blockRegex(), '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** Extract the first valid inline-image block and return the reader-facing prose. */
export function extractInlineImageSpec(content) {
    if (!content || !/rc[-_\s]*image[-_\s]*gen/i.test(content)) return null;

    const regex = blockRegex();
    let match;
    while ((match = regex.exec(content))) {
        const spec = parseInlineImageSpec(match[1]);
        if (spec) return { spec, cleaned: stripBlocks(content) };
    }
    return null;
}

/** Remove an incomplete metadata block left behind by an interrupted stream. */
export function stripDanglingInlineImageBlock(content) {
    if (!new RegExp(`<\\s*${NAME_PATTERN}`, 'i').test(content || '')) return String(content || '');
    return String(content).replace(new RegExp(`\\s*<\\s*${NAME_PATTERN}[\\s\\S]*$`, 'i'), '').trim();
}

/** Parse and clamp a requested resolution to the range accepted by modern ST providers. */
export function parseInlineResolution(value) {
    const match = String(value || '').match(/(\d{3,4})\s*[x×]\s*(\d{3,4})/i);
    if (!match) return null;
    const clamp = number => Math.round(Math.min(1536, Math.max(512, Number(number))) / 64) * 64;
    return { width: clamp(match[1]), height: clamp(match[2]) };
}

/** Stable enough for per-message idempotency without requiring WebCrypto. */
export function inlineImageSpecFingerprint(spec) {
    const source = JSON.stringify({
        positive: spec?.positive ?? '',
        negative: spec?.negative ?? '',
        resolution: spec?.resolution ?? '',
    });
    let hash = 2166136261;
    for (let index = 0; index < source.length; index++) {
        hash ^= source.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}
