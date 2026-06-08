import type {
    ReforgedCharacterCard,
    ReforgedCharacterCardSource,
} from '@/contracts/character';

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
        alternateGreetings: [],
        tags: [],
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

function detectRawVersion(root: JsonRecord, source: ReforgedCharacterCardSource): string {
    const rawVersion = readSpecVersion(root);
    if (rawVersion !== UNKNOWN_VERSION) {
        return rawVersion;
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

    return {
        name: readField(data, root, 'name'),
        description: readField(data, root, 'description'),
        personality: readField(data, root, 'personality'),
        scenario: readField(data, root, 'scenario'),
        firstMessage: readField(data, root, 'first_mes', 'firstMessage'),
        alternateGreetings: readListField(data, root, 'alternate_greetings', 'alternateGreetings'),
        tags: readListField(data, root, 'tags'),
        extensions: readExtensions(data, root),
        rawVersion: detectRawVersion(root, source),
        source,
    };
}
