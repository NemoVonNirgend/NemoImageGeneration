import { saveSettings, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
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
                <label for="nemo-inline-frequency">Generation frequency</label>
                <select id="nemo-inline-frequency" class="text_pole" data-setting="inlineImageFrequency">
                    ${[[1, 'Every eligible message'], [3, 'Every 3rd eligible message'], [5, 'Every 5th eligible message']].map(([value, label]) => `<option value="${value}" ${Number(settings.inlineImageFrequency) === value ? 'selected' : ''}>${label}</option>`).join('')}
                </select>
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
        saveSettingsDebounced();
        void saveSettings();
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
