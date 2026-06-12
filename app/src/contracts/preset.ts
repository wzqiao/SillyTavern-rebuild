// DRAFT: 待主干评审

/**
 * 旧版 OpenAI preset 兼容契约(M2 阶段二)。
 * 范围:采样参数 + prompts/prompt_order 主结构。
 * 不复刻完整 prompt manager(utility prompts、bias、按角色覆盖等不在范围)。
 */

export type ReforgedPresetPromptRole = 'system' | 'user' | 'assistant';

export interface ReforgedPresetPrompt {
    identifier: string;
    name: string;
    role: ReforgedPresetPromptRole;
    content: string;
    /** marker 槽位(chatHistory/charDescription 等)由运行时填充,自身无内容。 */
    marker: boolean;
    /** 来自 prompt_order 的启用开关。 */
    enabled: boolean;
    /** 0=相对(按 order 顺序),1=绝对(按 depth 注入聊天内,当前按顺序近似)。 */
    injectionPosition?: number;
    injectionDepth?: number;
}

export interface ReforgedPresetSampling {
    temperature?: number;
    topP?: number;
    topK?: number;
    topA?: number;
    minP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    repetitionPenalty?: number;
    seed?: number;
    maxTokens?: number;
    maxContext?: number;
}

export interface ReforgedPreset {
    name: string;
    sampling: ReforgedPresetSampling;
    /** 已按 prompt_order 排序,enabled 反映 order 中的开关。 */
    prompts: ReforgedPresetPrompt[];
}

export interface ReforgedPresetImportSource {
    fileName: string;
    format: 'json' | 'unknown';
}

export interface ReforgedPresetImportInput {
    fileName: string;
    mimeType?: string;
    text?: string;
}

export type ReforgedPresetImportFailureCode =
    | 'unsupported-format'
    | 'missing-content'
    | 'invalid-json'
    | 'invalid-preset';

export interface ReforgedPresetImportFailure {
    ok: false;
    code: ReforgedPresetImportFailureCode;
    message: string;
    source: ReforgedPresetImportSource;
}

export interface ReforgedPresetImportSuccess {
    ok: true;
    preset: ReforgedPreset;
    source: ReforgedPresetImportSource;
    warnings: string[];
}

export type ReforgedPresetImportResult = ReforgedPresetImportSuccess | ReforgedPresetImportFailure;

export interface ReforgedPresetLibraryItem {
    id: string;
    preset: ReforgedPreset;
    source: ReforgedPresetImportSource;
    importedAt: string;
    warnings: string[];
}
