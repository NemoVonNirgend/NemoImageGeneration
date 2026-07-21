import { saveSettings, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import {
    DEFAULT_POLLINATIONS_NEGATIVE_BEST_PRACTICES,
    DEFAULT_POLLINATIONS_PROMPT_BEST_PRACTICES,
} from './core/feature-settings.js';
import { POLLINATIONS_IMAGE_STYLE_PRESETS } from './core/utils.js';
import PollinationsInterceptor, { destroyPollinationsInterceptor, initPollinationsInterceptor } from './features/pollinations-interceptor.js';

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

const DEFAULTS = Object.freeze({
    enabled: true,
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
            nemoPollinationsPromptBestPractices: legacy.nemoPollinationsPromptBestPractices ?? DEFAULTS.nemoPollinationsPromptBestPractices,
            nemoPollinationsStylePreset: legacy.nemoPollinationsStylePreset ?? DEFAULTS.nemoPollinationsStylePreset,
            nemoPollinationsBestPracticesPrompt: legacy.nemoPollinationsBestPracticesPrompt ?? DEFAULTS.nemoPollinationsBestPracticesPrompt,
            nemoPollinationsNegativeBestPracticesPrompt: legacy.nemoPollinationsNegativeBestPracticesPrompt ?? DEFAULTS.nemoPollinationsNegativeBestPracticesPrompt,
        };
        saveSettingsDebounced();
    }
    const settings = extension_settings.NemoImageGeneration;
    for (const [key, value] of Object.entries(DEFAULTS)) settings[key] ??= value;
    return settings;
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
        settings[input.dataset.setting] = input.type === 'checkbox' ? input.checked : input.value;
        saveSettingsDebounced();
        void saveSettings();
        if (input.dataset.setting === 'enabled') {
            if (input.checked) initPollinationsInterceptor();
            else destroyPollinationsInterceptor();
        }
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
    if (settings.enabled) initPollinationsInterceptor();
}

window.NemoImageGeneration = Object.freeze({ ...PollinationsInterceptor, getSettings });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
else initialize();
