// DRAFT: 待主干评审

export type ReforgedChatJsonlParseErrorCode = 'empty-file' | 'invalid-jsonl';

export class ReforgedChatJsonlParseError extends Error {
    constructor(
        public readonly code: ReforgedChatJsonlParseErrorCode,
        message: string,
    ) {
        super(message);
        this.name = 'ReforgedChatJsonlParseError';
    }
}

export interface ReforgedLegacyChatMessage {
    role: 'user' | 'assistant';
    content: string;
    createdAt: string | null;
    alternatives: string[];
    activeAlternativeIndex: number;
}

export interface ReforgedLegacyChat {
    userName: string | null;
    characterName: string | null;
    messages: ReforgedLegacyChatMessage[];
    warnings: string[];
}

/**
 * 解析旧版 SillyTavern 聊天导出(jsonl):
 * 首行 `{chat_metadata, user_name, character_name}`,
 * 后续每行一条消息 `{name, is_user, is_system, send_date, mes, swipes?, swipe_id?}`。
 * 宽容策略:坏行/系统行跳过并记 warning,只有整体没有任何可用消息行才报错。
 */
export function parseChatJsonl(text: string): ReforgedLegacyChat {
    const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    if (lines.length === 0) {
        throw new ReforgedChatJsonlParseError('empty-file', 'Chat jsonl file is empty.');
    }

    const warnings: string[] = [];
    const records: Array<Record<string, unknown>> = [];

    for (const [index, line] of lines.entries()) {
        try {
            const parsed: unknown = JSON.parse(line);
            if (isRecord(parsed)) {
                records.push(parsed);
            } else {
                warnings.push(`Line ${index + 1} is not an object; skipped.`);
            }
        } catch {
            warnings.push(`Line ${index + 1} is not valid JSON; skipped.`);
        }
    }

    if (records.length === 0) {
        throw new ReforgedChatJsonlParseError('invalid-jsonl', 'No valid JSON lines found in chat file.');
    }

    let userName: string | null = null;
    let characterName: string | null = null;
    let messageRecords = records;

    // 首行若是元数据行(无 mes 字段),取出 user/character 名。
    const head = records[0];
    if (!('mes' in head)) {
        userName = readMeaningfulName(head.user_name);
        characterName = readMeaningfulName(head.character_name);
        messageRecords = records.slice(1);
    }

    const messages: ReforgedLegacyChatMessage[] = [];

    for (const record of messageRecords) {
        if (record.is_system === true) {
            warnings.push('Skipped a system message.');
            continue;
        }

        const swipes = Array.isArray(record.swipes)
            ? record.swipes.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
            : [];
        const swipeIndex = typeof record.swipe_id === 'number' && Number.isInteger(record.swipe_id)
            ? record.swipe_id
            : 0;
        const baseContent = typeof record.mes === 'string' ? record.mes : '';
        const content = (swipes[swipeIndex] ?? baseContent).trim();

        if (!content) {
            warnings.push('Skipped an empty message.');
            continue;
        }

        const role = record.is_user === true ? 'user' : 'assistant';
        const alternatives = role === 'assistant'
            ? (swipes.length > 0 ? swipes : [content])
            : [];

        messages.push({
            role,
            content,
            createdAt: readTimestamp(record.send_date),
            alternatives,
            activeAlternativeIndex: alternatives.length > 0
                ? Math.min(Math.max(swipeIndex, 0), alternatives.length - 1)
                : -1,
        });
    }

    if (messages.length === 0) {
        throw new ReforgedChatJsonlParseError('invalid-jsonl', 'Chat file contains no importable messages.');
    }

    return {
        userName,
        characterName,
        messages,
        warnings,
    };
}

// 旧版导出里 user_name/character_name 常是占位 "unused"。
function readMeaningfulName(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed && trimmed.toLowerCase() !== 'unused' ? trimmed : null;
}

// send_date 可能是 ISO 字符串、unix 毫秒数或旧版人类可读格式;解析失败给 null。
function readTimestamp(value: unknown): string | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }

    if (typeof value === 'string' && value.trim()) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }

    return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
