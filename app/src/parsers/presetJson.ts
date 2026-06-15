// DRAFT: 待主干评审

import type {
    ReforgedPreset,
    ReforgedPresetPrompt,
    ReforgedPresetPromptRole,
    ReforgedPresetSampling,
} from '@/contracts/preset';
import { normalizeRegexScripts } from '@/services/regexScriptService';

export type ReforgedPresetParseErrorCode = 'invalid-json' | 'invalid-preset';

export class ReforgedPresetParseError extends Error {
    constructor(
        public readonly code: ReforgedPresetParseErrorCode,
        message: string,
    ) {
        super(message);
        this.name = 'ReforgedPresetParseError';
    }
}

export interface ParsePresetJsonOptions {
    fallbackName?: string;
}

export interface ParsedPresetJson {
    preset: ReforgedPreset;
    warnings: string[];
}

/**
 * 解析旧版 SillyTavern OpenAI preset JSON。
 * 宽容策略:缺失字段给默认值并记 warning,只有整体不是对象/JSON 才抛错。
 *
 * prompt_order 的 character_id 约定:100001 是旧版 chat-completion 全局默认,
 * 优先取之;没有则取最后一个条目(社区预设常只导出一份自定义顺序)。
 */
export function parsePresetJson(text: string, options: ParsePresetJsonOptions = {}): ParsedPresetJson {
    let raw: unknown;

    try {
        raw = JSON.parse(text);
    } catch (error) {
        throw new ReforgedPresetParseError('invalid-json', `Preset JSON could not be parsed: ${describeError(error)}`);
    }

    if (!isRecord(raw)) {
        throw new ReforgedPresetParseError('invalid-preset', 'Preset JSON must be an object.');
    }

    const warnings: string[] = [];
    const sampling = readSampling(raw);
    const prompts = readOrderedPrompts(raw, warnings);
    const extensions = readExtensions(raw);

    if (prompts.length === 0) {
        warnings.push('Preset contains no usable prompts; only sampling parameters were imported.');
    }

    return {
        preset: {
            name: readString(raw.name) ?? options.fallbackName ?? 'Imported preset',
            sampling,
            prompts,
            regexScripts: normalizeRegexScripts(extensions.regex_scripts),
            extensions,
        },
        warnings,
    };
}

const GLOBAL_PROMPT_ORDER_CHARACTER_ID = 100001;

function readSampling(raw: Record<string, unknown>): ReforgedPresetSampling {
    const sampling: ReforgedPresetSampling = {};

    assignNumber(sampling, 'temperature', raw.temperature);
    assignNumber(sampling, 'topP', raw.top_p);
    assignNumber(sampling, 'topK', raw.top_k);
    assignNumber(sampling, 'topA', raw.top_a);
    assignNumber(sampling, 'minP', raw.min_p);
    assignNumber(sampling, 'frequencyPenalty', raw.frequency_penalty);
    assignNumber(sampling, 'presencePenalty', raw.presence_penalty);
    assignNumber(sampling, 'repetitionPenalty', raw.repetition_penalty);
    assignNumber(sampling, 'maxTokens', raw.openai_max_tokens);
    assignNumber(sampling, 'maxContext', raw.openai_max_context);

    const seed = readNumber(raw.seed);
    if (seed !== null && seed >= 0) {
        sampling.seed = seed;
    }

    return sampling;
}

function readOrderedPrompts(raw: Record<string, unknown>, warnings: string[]): ReforgedPresetPrompt[] {
    const promptsById = new Map<string, Omit<ReforgedPresetPrompt, 'enabled'>>();
    const rawPrompts = Array.isArray(raw.prompts) ? raw.prompts : [];

    for (const item of rawPrompts) {
        if (!isRecord(item)) {
            continue;
        }

        const identifier = readString(item.identifier);
        if (!identifier) {
            warnings.push('Skipped a prompt without an identifier.');
            continue;
        }

        promptsById.set(identifier, {
            identifier,
            name: readString(item.name) ?? identifier,
            role: readRole(item.role),
            content: readString(item.content) ?? '',
            marker: item.marker === true,
            injectionPosition: readNumber(item.injection_position) ?? undefined,
            injectionDepth: readNumber(item.injection_depth) ?? undefined,
        });
    }

    const orderEntries = readPromptOrder(raw, warnings);

    if (orderEntries.length === 0) {
        // 没有 prompt_order:按 prompts 原始顺序全部启用。
        if (promptsById.size > 0) {
            warnings.push('Preset has no prompt_order; using the raw prompt sequence.');
        }
        return [...promptsById.values()].map((prompt) => ({ ...prompt, enabled: true }));
    }

    const ordered: ReforgedPresetPrompt[] = [];
    const usedIdentifiers = new Set<string>();

    for (const entry of orderEntries) {
        const prompt = promptsById.get(entry.identifier);

        if (!prompt) {
            warnings.push(`prompt_order references unknown prompt "${entry.identifier}"; skipped.`);
            continue;
        }

        usedIdentifiers.add(entry.identifier);
        ordered.push({ ...prompt, enabled: entry.enabled });
    }

    const unordered = [...promptsById.keys()].filter((identifier) => !usedIdentifiers.has(identifier));
    if (unordered.length > 0) {
        warnings.push(`Prompts not referenced by prompt_order were excluded: ${unordered.join(', ')}.`);
    }

    return ordered;
}

function readPromptOrder(
    raw: Record<string, unknown>,
    warnings: string[],
): Array<{ identifier: string; enabled: boolean }> {
    const rawOrder = Array.isArray(raw.prompt_order) ? raw.prompt_order.filter(isRecord) : [];

    if (rawOrder.length === 0) {
        return [];
    }

    const globalEntry = rawOrder.find((entry) => readNumber(entry.character_id) === GLOBAL_PROMPT_ORDER_CHARACTER_ID);
    const chosen = globalEntry ?? rawOrder[rawOrder.length - 1];

    if (!globalEntry && rawOrder.length > 1) {
        warnings.push('prompt_order has no global entry (character_id 100001); using the last entry.');
    }

    const orderList = Array.isArray(chosen.order) ? chosen.order : [];

    return orderList
        .filter(isRecord)
        .map((item) => ({
            identifier: readString(item.identifier) ?? '',
            enabled: item.enabled !== false,
        }))
        .filter((item) => item.identifier.length > 0);
}

function readRole(value: unknown): ReforgedPresetPromptRole {
    return value === 'user' || value === 'assistant' ? value : 'system';
}

function assignNumber(
    sampling: ReforgedPresetSampling,
    key: keyof ReforgedPresetSampling,
    value: unknown,
): void {
    const parsed = readNumber(value);
    if (parsed !== null) {
        sampling[key] = parsed;
    }
}

function readNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}

function readExtensions(raw: Record<string, unknown>): Record<string, unknown> {
    if (isRecord(raw.extensions)) {
        return raw.extensions;
    }

    return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
