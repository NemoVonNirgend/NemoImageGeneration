import { saveSettings, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { power_user } from '../../../power-user.js';
import {
    DEFAULT_POLLINATIONS_NEGATIVE_BEST_PRACTICES,
    DEFAULT_POLLINATIONS_PROMPT_BEST_PRACTICES,
} from './core/feature-settings.js';
import { POLLINATIONS_IMAGE_STYLE_PRESETS } from './core/utils.js';
import PollinationsInterceptor, { destroyPollinationsInterceptor, initPollinationsInterceptor } from './features/pollinations-interceptor.js';
import {
    destroyAutomaticInlineGeneration,
    initAutomaticInlineGeneration,
    retryInlineImageGeneration,
} from './features/automatic-inline-generation.js';
import {
    destroyInlineImagePrompts,
    initInlineImagePrompts,
    refreshInlineImagePrompt,
} from './features/inline-image-prompts.js';

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

const DEFAULTS = Object.freeze({
    enabled: true,
    inlinePromptEnabled: true,
    autoInlineEnabled: true,
    inlineImageMode: 'important',
    inlineImageFrequency: 1,
    inlinePromptStyle: 'auto',
    pollinationsCaptureEnabled: true,
    nemoPollinationsPromptBestPractices: true,
    nemoPollinationsStylePreset: 'none',
    nemoPollinationsBestPracticesPrompt: DEFAULT_POLLINATIONS_PROMPT_BEST_PRACTICES,
    nemoPollinationsNegativeBestPracticesPrompt: DEFAULT_POLLINATIONS_NEGATIVE_BEST_PRACTICES,
});

function getSettings() {
    if (!extension_settings.NemoImageGeneration) {
        const legacy = extension_settings.NemoPresetExt ?? {};
        extension_settings.NemoImageGeneration = {
            enabled: legacy.nemoEnablePollinationsInterceptor ?? DEFAULTS.enabled,
            inlinePromptEnabled: DEFAULTS.inlinePromptEnabled,
            autoInlineEnabled: DEFAULTS.autoInlineEnabled,
            inlineImageMode: DEFAULTS.inlineImageMode,
            inlineImageFrequency: DEFAULTS.inlineImageFrequency,
            inlinePromptStyle: DEFAULTS.inlinePromptStyle,
            pollinationsCaptureEnabled: legacy.nemoEnablePollinationsInterceptor ?? DEFAULTS.pollinationsCaptureEnabled,
            nemoPollinationsPromptBestPractices: legacy.nemoPollinationsPromptBestPractices ?? DEFAULTS.nemoPollinationsPromptBestPractices,
            nemoPollinationsStylePreset: legacy.nemoPollinationsStylePreset ?? DEFAULTS.nemoPollinationsStylePreset,
            nemoPollinationsBestPracticesPrompt: legacy.nemoPollinationsBestPracticesPrompt ?? DEFAULTS.nemoPollinationsBestPracticesPrompt,
            nemoPollinationsNegativeBestPracticesPrompt: legacy.nemoPollinationsNegativeBestPracticesPrompt ?? DEFAULTS.nemoPollinationsNegativeBestPracticesPrompt,
        };
        saveSettingsDebounced();
    }
    const settings = extension_settings.NemoImageGeneration;
    let migrated = false;
    if (settings.inlineImageMode === undefined || settings.inlineImageMode === null) {
        const forkSceneImages = power_user.scene_images;
        if (forkSceneImages?.enabled) {
            settings.inlineImageFrequency = Math.max(1, Number(forkSceneImages.frequency) || 3);
            settings.inlineImageMode = settings.inlineImageFrequency > 1 ? 'nth' : 'every';
        } else {
            settings.inlineImageMode = Number(settings.inlineImageFrequency) > 1 ? 'nth' : DEFAULTS.inlineImageMode;
        }
        migrated = true;
    }
    for (const [key, value] of Object.entries(DEFAULTS)) {
        if (settings[key] !== undefined && settings[key] !== null) continue;
        settings[key] = value;
        migrated = true;
    }
    if (migrated) saveSettingsDebounced();
    return settings;
}

function syncFeatures() {
    const settings = getSettings();
    if (settings.enabled && (settings.inlinePromptEnabled || settings.autoInlineEnabled)) initInlineImagePrompts(getSettings);
    else destroyInlineImagePrompts();

    // The NemoTavern fork's Scene Images listener clicks the same paintbrush.
    // Transfer ownership once so the two independent queues cannot double-generate.
    if (settings.enabled && settings.autoInlineEnabled && power_user.scene_images?.enabled) {
        power_user.scene_images.enabled = false;
        const legacyToggle = document.querySelector('#sceneImagesCard input[type="checkbox"]');
        if (legacyToggle) legacyToggle.checked = false;
        saveSettingsDebounced();
    }
    if (settings.enabled && settings.autoInlineEnabled) initAutomaticInlineGeneration(getSettings);
    else destroyAutomaticInlineGeneration();

    if (settings.enabled && settings.pollinationsCaptureEnabled) initPollinationsInterceptor();
    else destroyPollinationsInterceptor();

    refreshInlineImagePrompt();
}

function mountSettings(settings) {
    if (document.getElementById('nemo-image-generation-settings')) return true;
    const container = document.getElementById('extensions_settings') ?? document.getElementById('extensions_settings2');
    if (!container) return false;
    const host = document.createElement('div');
    host.id = 'nemo-image-generation-settings';
    host.className = 'extension_container';
    host.innerHTML = `
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header"><b>Nemo Image Generation</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
            <div class="inline-drawer-content">
                <label class="checkbox_label"><input type="checkbox" data-setting="enabled" ${settings.enabled ? 'checked' : ''}><span>Enable automatic image workflows</span></label>
                <hr>
                <h4>Automatic inline images</h4>
                <label class="checkbox_label"><input type="checkbox" data-setting="inlinePromptEnabled" ${settings.inlinePromptEnabled ? 'checked' : ''}><span>Ask the narrator for hidden inline image prompts</span></label>
                <label class="checkbox_label"><input type="checkbox" data-setting="autoInlineEnabled" ${settings.autoInlineEnabled ? 'checked' : ''}><span>Generate and attach inline images automatically</span></label>
                <label for="nemo-inline-mode">When to generate</label>
                <select id="nemo-inline-mode" class="text_pole" data-setting="inlineImageMode">
                    ${[['important', 'Decide when it is important'], ['every', 'Every message'], ['nth', 'Every Nth message']].map(([value, label]) => `<option value="${value}" ${settings.inlineImageMode === value ? 'selected' : ''}>${label}</option>`).join('')}
                </select>
                <div data-nemo-nth-frequency ${settings.inlineImageMode === 'nth' ? '' : 'hidden'}>
                    <label for="nemo-inline-frequency">Nth-message interval</label>
                    <select id="nemo-inline-frequency" class="text_pole" data-setting="inlineImageFrequency">
                        ${[[2, 'Every 2nd message'], [3, 'Every 3rd message'], [5, 'Every 5th message'], [10, 'Every 10th message']].map(([value, label]) => `<option value="${value}" ${Number(settings.inlineImageFrequency) === value ? 'selected' : ''}>${label}</option>`).join('')}
                    </select>
                </div>
                <label for="nemo-inline-style">Prompt dialect</label>
                <select id="nemo-inline-style" class="text_pole" data-setting="inlinePromptStyle">
                    ${[['auto', 'Automatic from configured provider'], ['natural', 'Natural language'], ['booru', 'Danbooru / anime SDXL'], ['mixed', 'Mixed tags + prose'], ['anima', 'Anima mixed tags + prose'], ['nai', 'NovelAI tags']].map(([value, label]) => `<option value="${value}" ${settings.inlinePromptStyle === value ? 'selected' : ''}>${label}</option>`).join('')}
                </select>
                <small>The image is generated by SillyTavern's configured Image Generation provider and attached to the same assistant message.</small>
                <hr>
                <h4>Legacy Pollinations capture</h4>
                <label class="checkbox_label"><input type="checkbox" data-setting="pollinationsCaptureEnabled" ${settings.pollinationsCaptureEnabled ? 'checked' : ''}><span>Capture Pollinations image links</span></label>
                <label class="checkbox_label"><input type="checkbox" data-setting="nemoPollinationsPromptBestPractices" ${settings.nemoPollinationsPromptBestPractices ? 'checked' : ''}><span>Add image prompt quality guidance</span></label>
                <label for="nemo-image-style">Image style preset</label>
                <select id="nemo-image-style" class="text_pole" data-setting="nemoPollinationsStylePreset">
                    ${POLLINATIONS_IMAGE_STYLE_PRESETS.map(preset => `<option value="${preset.id}" ${settings.nemoPollinationsStylePreset === preset.id ? 'selected' : ''}>${preset.label}</option>`).join('')}
                </select>
                <label for="nemo-image-positive">Positive guidance</label>
                <textarea id="nemo-image-positive" class="text_pole" rows="3" data-setting="nemoPollinationsBestPracticesPrompt">${escapeHtml(settings.nemoPollinationsBestPracticesPrompt)}</textarea>
                <label for="nemo-image-negative">Negative guidance</label>
                <textarea id="nemo-image-negative" class="text_pole" rows="3" data-setting="nemoPollinationsNegativeBestPracticesPrompt">${escapeHtml(settings.nemoPollinationsNegativeBestPracticesPrompt)}</textarea>
            </div>
        </div>`;
    host.addEventListener('change', event => {
        const input = event.target.closest('[data-setting]');
        if (!input) return;
        settings[input.dataset.setting] = input.type === 'checkbox'
            ? input.checked
            : (input.dataset.setting === 'inlineImageFrequency' ? Number(input.value) : input.value);
        if (input.dataset.setting === 'inlineImageMode' && settings.inlineImageMode === 'nth' && Number(settings.inlineImageFrequency) < 2) {
            settings.inlineImageFrequency = 3;
            host.querySelector('[data-setting="inlineImageFrequency"]').value = '3';
        }
        saveSettingsDebounced();
        void saveSettings();
        host.querySelector('[data-nemo-nth-frequency]').hidden = settings.inlineImageMode !== 'nth';
        if (['inlineImageMode', 'inlineImageFrequency'].includes(input.dataset.setting)) {
            destroyAutomaticInlineGeneration();
        }
        syncFeatures();
    });
    container.appendChild(host);
    return true;
}

function observeSettings(settings) {
    mountSettings(settings);
    const observer = new MutationObserver(() => mountSettings(settings));
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
}

function initialize() {
    const settings = getSettings();
    observeSettings(settings);
    syncFeatures();
}

window.NemoImageGeneration = Object.freeze({
    ...PollinationsInterceptor,
    getSettings,
    retryInlineImageGeneration,
    refreshInlineImagePrompt,
});
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
else initialize();
