import {
    chat,
    eventSource,
    event_types,
    getCurrentChatId,
    saveChatDebounced,
} from '../../../../../script.js';
import { extension_settings, getContext } from '../../../../extensions.js';
import { power_user } from '../../../../power-user.js';
import { enqueueImageGeneration } from '../core/image-generation-queue.js';
import { inlineImageSpecFingerprint } from '../core/inline-image-spec.js';
import { captureInlineImageSpec } from './inline-image-prompts.js';

const handlers = [];
const GENERATION_TIMEOUT_MS = 180000;
let initialized = false;
let settingsProvider = () => ({});
let sinceLastImage = 0;
let lifecycleEpoch = 0;

function getSettings() {
    return settingsProvider() ?? {};
}

function isActive() {
    const settings = getSettings();
    return settings.enabled !== false && settings.autoInlineEnabled !== false;
}

function alreadyHasMedia(message) {
    return Array.isArray(message?.extra?.media) && message.extra.media.length > 0;
}

function getMessageId(data) {
    const value = typeof data === 'object' ? (data?.id ?? data?.messageId) : data;
    const id = Number(value);
    return Number.isInteger(id) ? id : null;
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function findMessageButton(messageId, deadline) {
    while (Date.now() < deadline) {
        const button = document.querySelector(`.mes[mesid="${messageId}"] .sd_message_gen`);
        if (button instanceof HTMLElement) return button;
        await wait(100);
    }
    return null;
}

async function waitUntilIdle(button, deadline) {
    while (button.classList.contains('fa-hourglass') && Date.now() < deadline) await wait(250);
    return !button.classList.contains('fa-hourglass');
}

function isCurrentJob(job) {
    if (job.epoch !== lifecycleEpoch) return false;
    if (getCurrentChatId() !== job.chatId || chat[job.messageId] !== job.message) return false;
    if (job.message.swipe_id !== job.swipeId) return false;
    if (job.message.extra?.nemo_image_generation !== job.state) return false;
    return inlineImageSpecFingerprint(job.message.extra?.inline_image_spec) === job.fingerprint;
}

async function runPaintbrushGeneration(job) {
    if (!isCurrentJob(job)) throw new Error('Inline image generation became stale before it started.');
    const deadline = Date.now() + GENERATION_TIMEOUT_MS;
    const button = await findMessageButton(job.messageId, Math.min(deadline, Date.now() + 3000));
    if (!button) throw new Error('SillyTavern Image Generation button is not available for this message.');
    if (!await waitUntilIdle(button, deadline)) throw new Error('Timed out waiting for Image Generation to become idle.');
    if (!isCurrentJob(job)) throw new Error('Inline image generation became stale while queued.');

    if (alreadyHasMedia(job.message)) {
        return job.message.extra.media.at(-1)?.url ?? '';
    }

    const beforeCount = job.message.extra?.media?.length ?? 0;
    button.click();
    const started = Date.now();
    let sawBusyState = false;

    while (Date.now() < deadline) {
        if (!isCurrentJob(job)) throw new Error('Chat, swipe, or inline image prompt changed before generation completed.');

        const mediaCount = job.message.extra?.media?.length ?? 0;
        if (mediaCount > beforeCount) return job.message.extra.media.at(-1)?.url ?? '';

        const isBusy = button.classList.contains('fa-hourglass');
        sawBusyState ||= isBusy;
        const elapsed = Date.now() - started;
        const settledWithoutMedia = (sawBusyState && !isBusy) || (!sawBusyState && elapsed > 10000);
        if (settledWithoutMedia) throw new Error('SillyTavern Image Generation finished without producing media.');
        await wait(400);
    }
    throw new Error('Inline image generation timed out.');
}

async function generateForMessage(messageId, { ignoreFrequency = false } = {}) {
    if (!isActive()) return;

    // The source fork already owns automatic clicking when Scene Images is on.
    // Avoid turning a second click into an abort while users migrate the feature.
    if (power_user.scene_images?.enabled) return;

    const context = getContext();
    if (messageId !== context.chat.length - 1) return;
    const message = context.chat[messageId];
    if (!message || message.is_user || message.is_system || message.mes === '...' || !message.mes?.trim()) return;
    if (alreadyHasMedia(message)) return;

    const spec = captureInlineImageSpec(messageId) ?? message.extra?.inline_image_spec;
    if (!spec?.positive) return;

    if (!ignoreFrequency) {
        sinceLastImage++;
        const frequency = Math.max(1, Number(getSettings().inlineImageFrequency) || 1);
        if (sinceLastImage < frequency) return;
        sinceLastImage = 0;
    }

    if (!extension_settings.sd?.source) {
        console.info('[Nemo Image Generation] Configure SillyTavern Image Generation before enabling automatic inline images.');
        return;
    }

    message.extra ??= {};
    const fingerprint = inlineImageSpecFingerprint(spec);
    const previous = message.extra.nemo_image_generation;
    if (previous?.fingerprint === fingerprint && ['pending', 'complete', 'failed'].includes(previous.status)) return;

    const state = message.extra.nemo_image_generation = {
        fingerprint,
        status: 'pending',
        requested_at: Date.now(),
    };
    saveChatDebounced();

    const job = {
        messageId,
        message,
        chatId: getCurrentChatId(),
        swipeId: message.swipe_id,
        fingerprint,
        state,
        epoch: lifecycleEpoch,
    };

    try {
        const url = await enqueueImageGeneration(() => runPaintbrushGeneration(job));
        if (!isCurrentJob(job)) {
            Object.assign(state, { status: 'cancelled', completed_at: Date.now() });
            return;
        }
        Object.assign(state, { status: 'complete', url, completed_at: Date.now() });
    } catch (error) {
        if (!isCurrentJob(job)) {
            Object.assign(state, { status: 'cancelled', completed_at: Date.now() });
            return;
        }
        Object.assign(state, { status: 'failed', error: String(error?.message || error), completed_at: Date.now() });
        console.warn('[Nemo Image Generation] Automatic inline image failed:', error);
    } finally {
        saveChatDebounced();
    }
}

function listen(event, handler) {
    if (!event) return;
    eventSource.on(event, handler);
    handlers.push([event, handler]);
}

export function initAutomaticInlineGeneration(getExtensionSettings) {
    settingsProvider = getExtensionSettings;
    if (initialized) return;
    initialized = true;
    lifecycleEpoch++;

    listen(event_types.CHARACTER_MESSAGE_RENDERED, (data, type) => {
        if (type === 'extension') return;
        const messageId = getMessageId(data);
        if (messageId !== null) void generateForMessage(messageId);
    });
    listen(event_types.MESSAGE_SWIPED, data => {
        const messageId = getMessageId(data);
        if (messageId !== null) setTimeout(() => void generateForMessage(messageId, { ignoreFrequency: true }), 0);
    });
    listen(event_types.CHAT_CHANGED, () => {
        sinceLastImage = 0;
        lifecycleEpoch++;
    });
}

export function destroyAutomaticInlineGeneration() {
    for (const [event, handler] of handlers.splice(0)) eventSource.removeListener(event, handler);
    initialized = false;
    sinceLastImage = 0;
    lifecycleEpoch++;
}

export function retryInlineImageGeneration(messageId) {
    const message = chat[messageId];
    if (message?.extra) delete message.extra.nemo_image_generation;
    return generateForMessage(Number(messageId), { ignoreFrequency: true });
}
