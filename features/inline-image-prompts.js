import {
    chat,
    eventSource,
    event_types,
    extension_prompt_roles,
    extension_prompt_types,
    saveChatDebounced,
    setExtensionPrompt,
    syncMesToSwipe,
    updateMessageBlock,
} from '../../../../../script.js';
import { extension_settings } from '../../../../extensions.js';
import { power_user } from '../../../../power-user.js';
import {
    extractInlineImageSpec,
    stripDanglingInlineImageBlock,
} from '../core/inline-image-spec.js';

const PROMPT_KEY = 'NEMO_IMAGE_GENERATION_INLINE';
const TAG = 'RC_ImageGen';
const characterRefs = new Map();
const handlers = [];
let settingsProvider = () => ({});
let initialized = false;

function getSettings() {
    return settingsProvider() ?? {};
}

function isCaptureActive() {
    const settings = getSettings();
    return settings.enabled !== false && (settings.inlinePromptEnabled !== false || settings.autoInlineEnabled !== false);
}

function isInjectionActive() {
    const settings = getSettings();
    return settings.enabled !== false && settings.inlinePromptEnabled !== false;
}

function specRefs(spec) {
    if (Array.isArray(spec?.refs)) return spec.refs;
    return spec?.ref ? [spec.ref] : [];
}

function adoptRef(ref) {
    if (!ref?.name || !ref.description) return false;
    const key = String(ref.name).toLowerCase();
    const existing = characterRefs.get(key);
    if (existing && ref.description.length < existing.description.length * 0.6) return false;
    characterRefs.set(key, { name: ref.name, description: ref.description });
    return true;
}

function rebuildCharacterRefs() {
    characterRefs.clear();
    for (const message of chat) {
        for (const ref of specRefs(message?.extra?.inline_image_spec)) adoptRef(ref);
    }
    refreshInlineImagePrompt();
}

function currentDialect() {
    const selected = getSettings().inlinePromptStyle ?? 'auto';
    if (selected !== 'auto') return selected;

    const source = String(extension_settings.sd?.source ?? '').toLowerCase();
    const model = [extension_settings.sd?.model, extension_settings.sd?.comfy_workflow]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    if (source === 'novel') return 'nai';
    if (model.includes('anima')) return 'anima';
    if (/(illustrious|pony|noob|animagine|danbooru|nai[-_ ]?diffusion)/i.test(model)) return 'booru';
    return 'natural';
}

function positivePromptDoc(dialect) {
    if (dialect === 'nai') {
        return 'Danbooru tags for NovelAI Diffusion, comma-separated. Order: subject count, each person\'s stable appearance, clothing, action, expression, camera, setting, lighting. Use {braces} for emphasis and separate multiple people with |.';
    }
    if (dialect === 'booru') {
        return 'Danbooru tags for an anime SDXL model, comma-separated. Order: subject count, each person\'s stable appearance, clothing, action, expression, camera, setting, lighting. Use (tag:1.2) sparingly for emphasis.';
    }
    if (dialect === 'anima') {
        return 'A mixed Anima prompt: first compact lowercase Danbooru tags, then 1-2 natural-language sentences. Bind every trait to its character, lead with the safety rating and subject count, and describe the exact present action and camera framing.';
    }
    if (dialect === 'mixed') {
        return 'A provider-neutral mixed prompt: first a compact comma-separated block of concrete visual tags, then 1-2 natural-language sentences clarifying character ownership, exact action, mood, setting, lighting, and camera framing. Avoid model-specific quality or score tags.';
    }
    return 'A vivid natural-language description in 2-4 sentences. Lead with each person\'s complete physical appearance and current action, followed by expression, camera framing, setting, and lighting. Do not use tag syntax.';
}

function generationMode() {
    const mode = getSettings().inlineImageMode;
    return ['important', 'every', 'nth'].includes(mode) ? mode : 'important';
}

export function buildInlineImageInstruction() {
    const dialect = currentDialect();
    const mode = generationMode();
    const mandatory = mode === 'every' || mode === 'nth';
    const knownRefs = [...characterRefs.values()]
        .filter(ref => ref.description)
        .map(ref => `- ${ref.name}: ${ref.description}`)
        .join('\n');

    return [
        '[Nemo Image Generation inline-image directive]',
        mandatory
            ? 'Write your normal roleplay response first. For EVERY normal assistant reply, you MUST append exactly one hidden metadata block at the very end; do not decide whether the moment is important enough. Depict the scene as it stands at the END of the response.'
            : 'Write your normal roleplay response first. Decide whether it contains a concrete visual moment important enough to illustrate. When it does, append exactly one hidden metadata block at the very end. Depict the scene as it stands at the END of the response.',
        `<${TAG}>`,
        '{',
        `  "positive_prompt": "${positivePromptDoc(dialect)}",`,
        '  "negative_prompt": "Undesired visual elements; always exclude minors and childlike bodies.",',
        '  "resolution": "1216x832 for scenes, 832x1216 for portraits, or 1024x1024 for square.",',
        '  "character_references": [{',
        '    "name": "Recurring visible character name",',
        '    "description": "Stable reusable adult visual identity: age range, face, skin, build, hair, eyes, species traits, marks, and signature outfit. Exclude pose, mood, camera, and temporary objects."',
        '  }],',
        '  "details": {',
        '    "characters": "Every visible character\'s complete drawable identity, current outfit, expression, pose, and literal action.",',
        '    "location": "Explicit setting, background, and notable objects.",',
        '    "action": "Literal body position, movement, contact, and visible effects.",',
        '    "lighting": "Lighting and atmosphere.",',
        '    "camera": "Framing, shot type, and composition."',
        '  }',
        '}',
        `</${TAG}>`,
        'The block is machine-readable metadata, not story prose. The image model knows nothing about the story: positive_prompt must describe every visible subject physically rather than relying on names or pronouns. Reuse established identities verbatim. Illustrate only adults. Omit the block for non-visual OOC or administrative replies.',
        mandatory
            ? 'For normal roleplay replies the block is mandatory. Only omit it for purely OOC, system, or administrative replies.'
            : 'If no visual moment is important enough, omit the block.',
        knownRefs ? `ESTABLISHED CHARACTER APPEARANCES:\n${knownRefs}` : '',
    ].filter(Boolean).join('\n');
}

export function refreshInlineImagePrompt() {
    // The NemoTavern fork uses its own prompt under a different setting. Let it
    // remain the single writer while this extension consumes the resulting spec.
    // Mandatory extension modes must still strengthen the fork's optional wording.
    const forkOwnsInjection = power_user.image_prompt_mode === 'inline' && generationMode() === 'important';
    setExtensionPrompt(
        PROMPT_KEY,
        isInjectionActive() && !forkOwnsInjection ? buildInlineImageInstruction() : '',
        extension_prompt_types.IN_CHAT,
        0,
        false,
        extension_prompt_roles.SYSTEM,
    );
}

function buildStoredPrompt(spec) {
    if (currentDialect() !== 'anima' || !spec.details) return spec.positive;
    const details = ['characters', 'action', 'location', 'lighting', 'camera']
        .map(key => String(spec.details[key] ?? '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
    return details.length ? `${spec.positive}\n${details.join(' ')}` : spec.positive;
}

function applyCleanedText(messageId, message, cleaned) {
    message.mes = cleaned;
    syncMesToSwipe(messageId);
    saveChatDebounced();
    if (document.querySelector(`.mes[mesid="${messageId}"]`)) updateMessageBlock(messageId, message);
}

export function captureInlineImageSpec(messageId, { clearCachedOnMissing = false } = {}) {
    if (!isCaptureActive()) return null;
    const message = chat[messageId];
    if (!message || message.is_user || !message.mes || message.mes === '...') return null;

    const result = extractInlineImageSpec(message.mes);
    if (!result) {
        const cleaned = stripDanglingInlineImageBlock(message.mes);
        if (cleaned !== message.mes) applyCleanedText(messageId, message, cleaned);
        if (clearCachedOnMissing && message.extra?.inline_image_spec) {
            delete message.extra.inline_image_spec;
            delete message.extra.title;
            delete message.extra.negative;
            delete message.extra.nemo_image_generation;
            saveChatDebounced();
            return null;
        }
        return message.extra?.inline_image_spec?.positive ? message.extra.inline_image_spec : null;
    }

    message.extra ??= {};
    message.extra.title = buildStoredPrompt(result.spec);
    if (result.spec.negative) message.extra.negative = result.spec.negative;
    message.extra.inline_image_spec = result.spec;

    let refsChanged = false;
    for (const ref of specRefs(result.spec)) refsChanged = adoptRef(ref) || refsChanged;
    if (refsChanged) refreshInlineImagePrompt();
    if (result.cleaned !== message.mes) applyCleanedText(messageId, message, result.cleaned);
    return result.spec;
}

function listen(event, handler) {
    eventSource.on(event, handler);
    handlers.push([event, handler]);
}

export function initInlineImagePrompts(getExtensionSettings) {
    settingsProvider = getExtensionSettings;
    if (initialized) {
        refreshInlineImagePrompt();
        return;
    }
    initialized = true;

    listen(event_types.MESSAGE_RECEIVED, messageId => {
        try { captureInlineImageSpec(Number(messageId)); }
        catch (error) { console.warn('[Nemo Image Generation] Inline image extraction failed:', error); }
    });
    listen(event_types.MESSAGE_UPDATED, messageId => {
        try { captureInlineImageSpec(Number(messageId), { clearCachedOnMissing: true }); }
        catch (error) { console.warn('[Nemo Image Generation] Inline image refresh failed:', error); }
    });
    listen(event_types.GENERATION_STOPPED, () => {
        try { if (chat.length) captureInlineImageSpec(chat.length - 1); }
        catch (error) { console.warn('[Nemo Image Generation] Inline image cleanup failed:', error); }
    });
    listen(event_types.CHAT_CHANGED, rebuildCharacterRefs);

    rebuildCharacterRefs();
    setTimeout(rebuildCharacterRefs, 2000);
}

export function destroyInlineImagePrompts() {
    for (const [event, handler] of handlers.splice(0)) eventSource.removeListener(event, handler);
    initialized = false;
    characterRefs.clear();
    setExtensionPrompt(PROMPT_KEY, '', extension_prompt_types.IN_CHAT, 0, false, extension_prompt_roles.SYSTEM);
}
