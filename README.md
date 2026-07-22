# Nemo Image Generation

Automatic inline illustrations powered by SillyTavern's configured Image Generation provider.

Install through Nemo Hub or SillyTavern's third-party extension installer with:

`https://github.com/NemoVonNirgend/NemoImageGeneration`

The extension asks the narrator to append a hidden `<RC_ImageGen>` description when a reply contains a visual moment. It removes that metadata from the displayed prose, preserves recurring character appearances, and automatically triggers SillyTavern's native per-message Image Generation workflow. The resulting image is saved and attached to the same assistant message.

The settings drawer controls automatic generation, cadence, and prompt dialects including natural language, Danbooru tags, provider-neutral mixed tags plus prose, Anima mixed prompts, and NovelAI tags. It also retains optional legacy Pollinations-link capture. Provider selection and credentials remain entirely managed by SillyTavern's Image Generation extension.

Settings persist in `extension_settings.NemoImageGeneration`; compatible former NemoPresetExt values migrate on first launch. The automatic path does not require or fall back to a Pollinations link.
