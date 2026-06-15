import type { ReforgedChatEngineMessage } from '@/contracts/chat';
import { REFORGED_REGEX_PLACEMENT, type ReforgedRegexPlacement, type ReforgedRegexScript } from '@/contracts/regex';

const REGEX_LITERAL_PATTERN = /^\/([\w\W]*)\/([dgimsuvy]*)$/;
const SUPPORTED_FLAGS_PATTERN = /[gimsuy]/g;

type RegexScriptSource = Record<string, unknown>;

export function normalizeRegexScripts(value: unknown): ReforgedRegexScript[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter(isRecord)
        .map(normalizeRegexScript)
        .filter((script): script is ReforgedRegexScript => script !== null);
}

export function applyRegexScriptsToEngineMessages(
    messages: ReforgedChatEngineMessage[],
    scripts: ReforgedRegexScript[] = [],
): ReforgedChatEngineMessage[] {
    if (scripts.length === 0) {
        return messages;
    }

    return messages.map((message) => {
        if (typeof message.content !== 'string') {
            return message;
        }

        const placement = message.role === 'user'
            ? REFORGED_REGEX_PLACEMENT.USER_INPUT
            : message.role === 'assistant'
                ? REFORGED_REGEX_PLACEMENT.AI_OUTPUT
                : REFORGED_REGEX_PLACEMENT.WORLD_INFO;

        return {
            ...message,
            content: applyRegexScripts(message.content, scripts, placement),
        };
    });
}

export function applyRegexScripts(
    input: string,
    scripts: ReforgedRegexScript[] = [],
    placement: ReforgedRegexPlacement,
): string {
    return scripts.reduce((current, script) => applyRegexScript(current, script, placement), input);
}

function normalizeRegexScript(raw: RegexScriptSource): ReforgedRegexScript | null {
    const findRegex = readString(raw.findRegex) ?? readString(raw.find_regex);
    if (!findRegex) {
        return null;
    }

    const placement = readPlacement(raw.placement);
    if (placement.length === 0) {
        return null;
    }

    return {
        scriptName: readString(raw.scriptName) ?? readString(raw.script_name) ?? undefined,
        findRegex,
        replaceString: readString(raw.replaceString) ?? readString(raw.replace_string) ?? '',
        placement,
        disabled: readBoolean(raw.disabled),
        markdownOnly: readBoolean(raw.markdownOnly ?? raw.markdown_only),
        promptOnly: readBoolean(raw.promptOnly ?? raw.prompt_only),
        runOnEdit: readBoolean(raw.runOnEdit ?? raw.run_on_edit),
        minDepth: readNumber(raw.minDepth ?? raw.min_depth),
        maxDepth: readNumber(raw.maxDepth ?? raw.max_depth),
        substituteRegex: readNumber(raw.substituteRegex ?? raw.substitute_regex) ?? undefined,
        trimStrings: readStringArray(raw.trimStrings ?? raw.trim_strings),
        raw,
    };
}

function applyRegexScript(input: string, script: ReforgedRegexScript, placement: ReforgedRegexPlacement): string {
    if (script.disabled || !script.placement.includes(placement)) {
        return input;
    }

    const regex = parseRegex(script.findRegex);
    if (!regex) {
        return input;
    }

    const replacement = script.replaceString.replace(/\{\{match\}\}/gi, '$0');

    try {
        return input.replace(regex, (...args: unknown[]) => {
            const match = String(args[0] ?? '');
            const groups = isRecord(args.at(-1)) ? args.at(-1) as Record<string, unknown> : {};
            return replacement.replace(/\$(\d+)|\$<([^>]+)>/g, (token, numbered: string | undefined, named: string | undefined) => {
                if (numbered) {
                    return String(args[Number(numbered)] ?? '');
                }

                if (named) {
                    return String(groups[named] ?? '');
                }

                return token;
            }).replace(/\$0/g, trimMatch(match, script.trimStrings ?? []));
        });
    } catch {
        return input;
    }
}

function parseRegex(value: string): RegExp | null {
    const literal = REGEX_LITERAL_PATTERN.exec(value);
    const source = literal?.[1] ?? value;
    const flags = literal?.[2]?.match(SUPPORTED_FLAGS_PATTERN)?.join('') ?? 'g';

    try {
        return new RegExp(source, flags.includes('g') ? flags : `${flags}g`);
    } catch {
        return null;
    }
}

function trimMatch(match: string, trimStrings: string[]): string {
    return trimStrings.reduce((current, trimString) => current.split(trimString).join(''), match);
}

function readPlacement(value: unknown): ReforgedRegexPlacement[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter((item): item is ReforgedRegexPlacement => (
            item === REFORGED_REGEX_PLACEMENT.USER_INPUT ||
            item === REFORGED_REGEX_PLACEMENT.AI_OUTPUT ||
            item === REFORGED_REGEX_PLACEMENT.WORLD_INFO
        ));
}

function readString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}

function readStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function readNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
