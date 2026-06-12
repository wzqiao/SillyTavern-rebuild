import { describe, expect, it } from 'vitest';
import { parsePresetJson, ReforgedPresetParseError } from './presetJson';

const SAMPLE_PRESET = {
    temperature: 0.7,
    frequency_penalty: 0.1,
    presence_penalty: 0.2,
    top_p: 0.9,
    top_k: 40,
    min_p: 0.05,
    repetition_penalty: 1.1,
    seed: -1,
    openai_max_context: 8192,
    openai_max_tokens: 400,
    prompts: [
        { name: 'Main Prompt', system_prompt: true, role: 'system', content: 'Write {{char}} next reply.', identifier: 'main' },
        { name: 'Aux', system_prompt: true, role: 'system', content: 'Stay tasteful.', identifier: 'nsfw' },
        { identifier: 'chatHistory', name: 'Chat History', system_prompt: true, marker: true },
        { identifier: 'charDescription', name: 'Char Description', system_prompt: true, marker: true },
        { name: 'Post-History', system_prompt: true, role: 'system', content: 'Final instruction.', identifier: 'jailbreak' },
        { name: 'Orphan', system_prompt: true, role: 'system', content: 'Never referenced.', identifier: 'orphan' },
    ],
    prompt_order: [
        {
            character_id: 100000,
            order: [{ identifier: 'main', enabled: true }],
        },
        {
            character_id: 100001,
            order: [
                { identifier: 'main', enabled: true },
                { identifier: 'charDescription', enabled: true },
                { identifier: 'nsfw', enabled: false },
                { identifier: 'chatHistory', enabled: true },
                { identifier: 'jailbreak', enabled: true },
                { identifier: 'ghost', enabled: true },
            ],
        },
    ],
};

describe('parsePresetJson', () => {
    it('extracts sampling parameters with snake_case mapping', () => {
        const { preset } = parsePresetJson(JSON.stringify(SAMPLE_PRESET), { fallbackName: 'sample' });

        expect(preset.sampling).toEqual({
            temperature: 0.7,
            topP: 0.9,
            topK: 40,
            minP: 0.05,
            frequencyPenalty: 0.1,
            presencePenalty: 0.2,
            repetitionPenalty: 1.1,
            maxTokens: 400,
            maxContext: 8192,
        });
        // seed -1 表示「随机」,不导入
        expect(preset.sampling.seed).toBeUndefined();
    });

    it('orders prompts by the global (100001) prompt_order entry and keeps enabled flags', () => {
        const { preset, warnings } = parsePresetJson(JSON.stringify(SAMPLE_PRESET), { fallbackName: 'sample' });

        expect(preset.prompts.map((prompt) => prompt.identifier)).toEqual([
            'main', 'charDescription', 'nsfw', 'chatHistory', 'jailbreak',
        ]);
        expect(preset.prompts.find((prompt) => prompt.identifier === 'nsfw')?.enabled).toBe(false);
        expect(preset.prompts.find((prompt) => prompt.identifier === 'chatHistory')?.marker).toBe(true);
        expect(warnings.some((warning) => warning.includes('ghost'))).toBe(true);
        expect(warnings.some((warning) => warning.includes('orphan'))).toBe(true);
    });

    it('falls back to raw prompt sequence when prompt_order is missing', () => {
        const { prompt_order: _omitted, ...withoutOrder } = SAMPLE_PRESET;
        const { preset, warnings } = parsePresetJson(JSON.stringify(withoutOrder), { fallbackName: 'sample' });

        expect(preset.prompts).toHaveLength(6);
        expect(preset.prompts.every((prompt) => prompt.enabled)).toBe(true);
        expect(warnings.some((warning) => warning.includes('no prompt_order'))).toBe(true);
    });

    it('uses the fallback name when the preset has none', () => {
        const { preset } = parsePresetJson('{"temperature": 1}', { fallbackName: 'My Preset' });
        expect(preset.name).toBe('My Preset');
        expect(preset.prompts).toHaveLength(0);
    });

    it('throws a typed error for invalid JSON', () => {
        expect(() => parsePresetJson('{nope')).toThrowError(ReforgedPresetParseError);
        expect(() => parsePresetJson('[1,2]')).toThrowError(/must be an object/);
    });
});
