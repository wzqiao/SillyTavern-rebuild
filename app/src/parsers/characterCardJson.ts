import type {
    ReforgedCharacterCard,
    ReforgedCharacterCardSource,
} from '@/contracts/character';
import { normalizeRegexScripts } from '@/services/regexScriptService';

type JsonRecord = Record<string, unknown>;

const UNKNOWN_VERSION = 'unknown';
const UNKNOWN_SOURCE: ReforgedCharacterCardSource = 'json-unknown';

function createEmptyCard(): ReforgedCharacterCard {
    return {
        name: '',
        description: '',
        personality: '',
        scenario: '',
        firstMessage: '',
        exampleMessages: '',
        alternateGreetings: [],
        tags: [],
        characterBook: null,
        regexScripts: [],
        extensions: {},
        rawVersion: UNKNOWN_VERSION,
        source: UNKNOWN_SOURCE,
    };
}

function asRecord(value: unknown): JsonRecord | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    return value as JsonRecord;
}

function parseUnknownJson(input: unknown): unknown {
    if (typeof input !== 'string') {
        return input;
    }

    try {
        return JSON.parse(input);
    } catch {
        return null;
    }
}

function readString(record: JsonRecord | null, ...keys: string[]): string {
    if (!record) {
        return '';
    }

    for (const key of keys) {
        const value = record[key];
        if (typeof value === 'string') {
            return value;
        }
    }

    return '';
}

function readStringList(record: JsonRecord | null, ...keys: string[]): string[] {
    if (!record) {
        return [];
    }

    for (const key of keys) {
        const value = record[key];

        if (Array.isArray(value)) {
            return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
        }

        if (typeof value === 'string') {
            if (key === 'tags') {
                return value.split(',').map(item => item.trim()).filter(Boolean);
            }

            return value.trim().length > 0 ? [value] : [];
        }
    }

    return [];
}

function readObject(record: JsonRecord | null, ...keys: string[]): Record<string, unknown> {
    if (!record) {
        return {};
    }

    for (const key of keys) {
        const value = asRecord(record[key]);
        if (value) {
            return { ...value };
        }
    }

    return {};
}

function readDataRecord(root: JsonRecord): JsonRecord | null {
    return asRecord(root.data);
}

function readSpecVersion(root: JsonRecord): string {
    const version = root.spec_version;

    if (typeof version === 'string' && version.length > 0) {
        return version;
    }

    if (typeof version === 'number' && Number.isFinite(version)) {
        return String(version);
    }

    return UNKNOWN_VERSION;
}

function detectSource(root: JsonRecord, data: JsonRecord | null): ReforgedCharacterCardSource {
    const spec = readString(root, 'spec');
    const rawVersion = readSpecVersion(root);
    const numericVersion = Number(rawVersion);

    if (spec === 'chara_card_v2') {
        return 'json-v2';
    }

    if (spec === 'chara_card_v3') {
        return 'json-v3-like';
    }

    if (data && Number.isFinite(numericVersion) && numericVersion >= 3 && numericVersion < 4) {
        return 'json-v3-like';
    }

    if (data) {
        return 'json-v2-like';
    }

    if (hasV1LikeFields(root)) {
        return 'json-v1-like';
    }

    return UNKNOWN_SOURCE;
}

function readField(data: JsonRecord | null, root: JsonRecord, ...keys: string[]): string {
    const fromData = readString(data, ...keys);
    if (fromData.length > 0) {
        return fromData;
    }

    return readString(root, ...keys);
}

function readListField(data: JsonRecord | null, root: JsonRecord, ...keys: string[]): string[] {
    const fromData = readStringList(data, ...keys);
    if (fromData.length > 0) {
        return fromData;
    }

    return readStringList(root, ...keys);
}

function readExtensions(data: JsonRecord | null, root: JsonRecord): Record<string, unknown> {
    const fromData = readObject(data, 'extensions');
    if (Object.keys(fromData).length > 0) {
        return fromData;
    }

    return readObject(root, 'extensions');
}

function readCharacterBook(data: JsonRecord | null, root: JsonRecord): Record<string, unknown> | null {
    const fromData = readObject(data, 'character_book', 'characterBook');
    if (Object.keys(fromData).length > 0) {
        return fromData;
    }

    const fromRoot = readObject(root, 'character_book', 'characterBook');
    return Object.keys(fromRoot).length > 0 ? fromRoot : null;
}

function detectRawVersion(root: JsonRecord, source: ReforgedCharacterCardSource): string {
    const rawVersion = readSpecVersion(root);
    if (rawVersion !== UNKNOWN_VERSION) {
        return rawVersion;
    }

    if (source === 'json-v1-like') {
        return '1.0';
    }

    if (source === 'json-v2' || source === 'json-v2-like') {
        return '2.0';
    }

    if (source === 'json-v3-like') {
        return '3.0';
    }

    return UNKNOWN_VERSION;
}

export function parseCharacterCardJson(input: unknown): ReforgedCharacterCard {
    const parsed = parseUnknownJson(input);
    const root = asRecord(parsed);

    if (!root) {
        return createEmptyCard();
    }

    const data = readDataRecord(root);
    const source = detectSource(root, data);
    const extensions = readExtensions(data, root);

    return {
        name: readField(data, root, 'name', 'char_name'),
        description: readField(data, root, 'description', 'char_persona', 'persona'),
        personality: readField(data, root, 'personality', 'char_personality'),
        scenario: readField(data, root, 'scenario', 'world_scenario'),
        firstMessage: readField(data, root, 'first_mes', 'firstMessage', 'char_greeting', 'greeting'),
        exampleMessages: readField(data, root, 'mes_example', 'exampleMessages', 'example_dialogue'),
        alternateGreetings: readListField(data, root, 'alternate_greetings', 'alternateGreetings', 'alternate_greeting'),
        tags: readListField(data, root, 'tags'),
        characterBook: readCharacterBook(data, root),
        regexScripts: normalizeRegexScripts(extensions.regex_scripts),
        extensions,
        rawVersion: detectRawVersion(root, source),
        source,
    };
}

function hasV1LikeFields(root: JsonRecord): boolean {
    const hasName = hasNonEmptyString(root, 'name') || hasNonEmptyString(root, 'char_name');
    const hasCharacterField = [
        'description',
        'char_persona',
        'personality',
        'char_personality',
        'scenario',
        'world_scenario',
        'first_mes',
        'firstMessage',
        'char_greeting',
        'mes_example',
        'creatorcomment',
    ].some((key) => hasNonEmptyString(root, key));

    return hasName && hasCharacterField;
}

function hasNonEmptyString(record: JsonRecord, key: string): boolean {
    const value = record[key];
    return typeof value === 'string' && value.trim().length > 0;
}
