import type {
    ReforgedWorldbook,
    ReforgedWorldbookEntry,
    ReforgedWorldbookEntryPosition,
    ReforgedWorldbookSource,
    ReforgedWorldbookImportFailureCode,
} from '@/contracts/worldbook';

const WORLD_INFO_POSITION_NAMES: Record<number, ReforgedWorldbookEntryPosition> = {
    0: 'before',
    1: 'after',
    2: 'author-note-top',
    3: 'author-note-bottom',
    4: 'at-depth',
    5: 'examples-top',
    6: 'examples-bottom',
    7: 'outlet',
};

export class ReforgedWorldbookParseError extends Error {
    constructor(
        public readonly code: ReforgedWorldbookImportFailureCode,
        message: string,
    ) {
        super(message);
        this.name = 'ReforgedWorldbookParseError';
    }
}

export interface ReforgedWorldbookJsonParseOptions {
    fallbackName?: string;
}

export function parseWorldbookJson(
    text: string,
    options: ReforgedWorldbookJsonParseOptions = {},
): ReforgedWorldbook {
    const data = parseJsonRecord(text);
    const source = detectWorldbookSource(data);
    if (source === 'unknown') {
        throw new ReforgedWorldbookParseError(
            'unsupported-format',
            'Worldbook JSON is not a supported SillyTavern world info or Character Book shape.',
        );
    }

    const entries = parseEntries(data, source);

    if (entries.length === 0) {
        throw new ReforgedWorldbookParseError('empty-worldbook', 'Worldbook JSON did not contain any usable entries.');
    }

    return {
        name: readString(data.name) ?? readString(data.displayName) ?? options.fallbackName ?? 'Imported Worldbook',
        source,
        entries,
        raw: data,
    };
}

function parseJsonRecord(text: string): Record<string, unknown> {
    let data: unknown;

    try {
        data = JSON.parse(text);
    } catch {
        throw new ReforgedWorldbookParseError('invalid-json', 'Worldbook JSON is not valid JSON.');
    }

    if (!isRecord(data)) {
        throw new ReforgedWorldbookParseError('unsupported-format', 'Worldbook JSON root must be an object.');
    }

    return data;
}

function detectWorldbookSource(data: Record<string, unknown>): ReforgedWorldbookSource {
    if (isRecord(data.entries)) {
        return 'sillytavern-world-info';
    }

    if (Array.isArray(data.entries) && data.entries.some(isCharacterBookEntry)) {
        return 'character-book';
    }

    return 'unknown';
}

function parseEntries(data: Record<string, unknown>, source: ReforgedWorldbookSource): ReforgedWorldbookEntry[] {
    if (source === 'sillytavern-world-info' && isRecord(data.entries)) {
        return Object.entries(data.entries)
            .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
            .map(([entryKey, entry], index) => normalizeSillyTavernEntry(entryKey, entry, index))
            .filter(isUsableEntry);
    }

    if (source === 'character-book' && Array.isArray(data.entries)) {
        return data.entries
            .filter(isRecord)
            .map((entry, index) => normalizeCharacterBookEntry(entry, index))
            .filter(isUsableEntry);
    }

    return [];
}

function normalizeSillyTavernEntry(
    entryKey: string,
    entry: Record<string, unknown>,
    index: number,
): ReforgedWorldbookEntry {
    const uid = readUid(entry.uid) ?? entryKey;
    const positionRaw = entry.position;

    return {
        id: String(uid ?? (entryKey || index)),
        uid,
        comment: readString(entry.comment) ?? '',
        content: readString(entry.content) ?? '',
        primaryKeys: readStringArray(entry.key),
        secondaryKeys: readStringArray(entry.keysecondary),
        enabled: !readBoolean(entry.disable, false),
        constant: readBoolean(entry.constant, false),
        selective: readBoolean(entry.selective, false),
        selectiveLogic: readNullableNumber(entry.selectiveLogic),
        insertionOrder: readNumber(entry.order) ?? 100,
        displayIndex: readNullableNumber(entry.displayIndex),
        position: normalizePosition(positionRaw),
        positionRaw,
        role: readRole(entry.role),
        depth: readNullableNumber(entry.depth),
        scanDepth: readNullableNumber(entry.scanDepth),
        probability: readNullableNumber(entry.probability),
        useProbability: readBoolean(entry.useProbability, true),
        caseSensitive: readNullableBoolean(entry.caseSensitive),
        matchWholeWords: readNullableBoolean(entry.matchWholeWords),
        useGroupScoring: readNullableBoolean(entry.useGroupScoring),
        vectorized: readBoolean(entry.vectorized, false),
        addMemo: readBoolean(entry.addMemo, false),
        excludeRecursion: readBoolean(entry.excludeRecursion, false),
        preventRecursion: readBoolean(entry.preventRecursion, false),
        delayUntilRecursion: readBooleanOrNumber(entry.delayUntilRecursion, false),
        ignoreBudget: readBoolean(entry.ignoreBudget, false),
        group: readString(entry.group) ?? '',
        groupOverride: readBoolean(entry.groupOverride, false),
        groupWeight: readNullableNumber(entry.groupWeight),
        outletName: readString(entry.outletName) ?? '',
        automationId: readString(entry.automationId) ?? '',
        sticky: readNullableNumber(entry.sticky),
        cooldown: readNullableNumber(entry.cooldown),
        delay: readNullableNumber(entry.delay),
        triggers: readStringArray(entry.triggers),
        matchPersonaDescription: readBoolean(entry.matchPersonaDescription, false),
        matchCharacterDescription: readBoolean(entry.matchCharacterDescription, false),
        matchCharacterPersonality: readBoolean(entry.matchCharacterPersonality, false),
        matchCharacterDepthPrompt: readBoolean(entry.matchCharacterDepthPrompt, false),
        matchScenario: readBoolean(entry.matchScenario, false),
        matchCreatorNotes: readBoolean(entry.matchCreatorNotes, false),
        extensionsRaw: isRecord(entry.extensions) ? entry.extensions : null,
        raw: entry,
    };
}

function normalizeCharacterBookEntry(
    entry: Record<string, unknown>,
    index: number,
): ReforgedWorldbookEntry {
    const extensions = isRecord(entry.extensions) ? entry.extensions : {};
    const uid = readUid(entry.id) ?? index;
    const positionRaw = extensions.position ?? entry.position;

    return {
        id: String(uid),
        uid,
        comment: readString(entry.comment) ?? '',
        content: readString(entry.content) ?? '',
        primaryKeys: readStringArray(entry.keys),
        secondaryKeys: readStringArray(entry.secondary_keys),
        enabled: readBoolean(entry.enabled, true),
        constant: readBoolean(entry.constant, false),
        selective: readBoolean(entry.selective, false),
        selectiveLogic: readNullableNumber(extensions.selectiveLogic),
        insertionOrder: readNumber(entry.insertion_order) ?? 100,
        displayIndex: readNullableNumber(extensions.display_index) ?? index,
        position: normalizePosition(positionRaw, entry.position),
        positionRaw,
        role: readRole(extensions.role),
        depth: readNullableNumber(extensions.depth),
        scanDepth: readNullableNumber(extensions.scan_depth),
        probability: readNullableNumber(extensions.probability),
        useProbability: readBoolean(extensions.useProbability, true),
        caseSensitive: readNullableBoolean(extensions.case_sensitive),
        matchWholeWords: readNullableBoolean(extensions.match_whole_words),
        useGroupScoring: readNullableBoolean(extensions.use_group_scoring),
        vectorized: readBoolean(extensions.vectorized, false),
        addMemo: Boolean(readString(entry.comment)),
        excludeRecursion: readBoolean(extensions.exclude_recursion, false),
        preventRecursion: readBoolean(extensions.prevent_recursion, false),
        delayUntilRecursion: readBooleanOrNumber(extensions.delay_until_recursion, false),
        ignoreBudget: readBoolean(extensions.ignore_budget, false),
        group: readString(extensions.group) ?? '',
        groupOverride: readBoolean(extensions.group_override, false),
        groupWeight: readNullableNumber(extensions.group_weight),
        outletName: readString(extensions.outlet_name) ?? '',
        automationId: readString(extensions.automation_id) ?? '',
        sticky: readNullableNumber(extensions.sticky),
        cooldown: readNullableNumber(extensions.cooldown),
        delay: readNullableNumber(extensions.delay),
        triggers: readStringArray(extensions.triggers),
        matchPersonaDescription: readBoolean(extensions.match_persona_description, false),
        matchCharacterDescription: readBoolean(extensions.match_character_description, false),
        matchCharacterPersonality: readBoolean(extensions.match_character_personality, false),
        matchCharacterDepthPrompt: readBoolean(extensions.match_character_depth_prompt, false),
        matchScenario: readBoolean(extensions.match_scenario, false),
        matchCreatorNotes: readBoolean(extensions.match_creator_notes, false),
        extensionsRaw: extensions,
        raw: entry,
    };
}

function normalizePosition(value: unknown, fallback?: unknown): ReforgedWorldbookEntryPosition {
    if (typeof value === 'number') {
        return WORLD_INFO_POSITION_NAMES[value] ?? 'unknown';
    }

    if (typeof value === 'string') {
        if (value === 'before_char') {
            return 'before';
        }

        if (value === 'after_char') {
            return 'after';
        }

        if (value in WORLD_INFO_POSITION_NAMES) {
            return WORLD_INFO_POSITION_NAMES[Number(value)] ?? 'unknown';
        }
    }

    return typeof fallback !== 'undefined' ? normalizePosition(fallback) : 'unknown';
}

function isCharacterBookEntry(value: unknown): boolean {
    return isRecord(value) && (Array.isArray(value.keys) || typeof value.content === 'string');
}

function isUsableEntry(entry: ReforgedWorldbookEntry): boolean {
    return entry.content.trim().length > 0 || entry.primaryKeys.length > 0 || entry.comment.trim().length > 0;
}

function readString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}

function readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.filter((item): item is string => typeof item === 'string');
}

function readNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readNullableNumber(value: unknown): number | null {
    return value === null || typeof value === 'undefined' ? null : readNumber(value);
}

function readBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

function readBooleanOrNumber(value: unknown, fallback: boolean | number): boolean | number {
    if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
        return value;
    }

    return fallback;
}

function readNullableBoolean(value: unknown): boolean | null {
    return typeof value === 'boolean' ? value : null;
}

function readRole(value: unknown): string | number | null {
    return typeof value === 'string' || typeof value === 'number' ? value : null;
}

function readUid(value: unknown): string | number | null {
    if (typeof value === 'string' || typeof value === 'number') {
        return value;
    }

    return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
