import type {
    ReforgedCharacterCard,
    ReforgedCharacterCardPngParseReason,
    ReforgedCharacterImportFailure,
    ReforgedCharacterImportFailureCode,
    ReforgedCharacterImportFormat,
    ReforgedCharacterImportInput,
    ReforgedCharacterImportResult,
    ReforgedCharacterImportSource,
} from '@/contracts/character';
import { parseCharacterCardJson } from '@/parsers/characterCardJson';
import { parseCharacterCardPng } from '@/parsers/characterCardPng';

type CharacterImportBytes = NonNullable<ReforgedCharacterImportInput['bytes']>;

const SUPPORTED_M0_FORMATS = new Set<ReforgedCharacterImportFormat>(['json', 'png']);
const TEXT_DECODER = new TextDecoder('utf-8', { fatal: true });

export function importCharacterCard(input: ReforgedCharacterImportInput): ReforgedCharacterImportResult {
    const source = createImportSource(input);

    if (!SUPPORTED_M0_FORMATS.has(source.format)) {
        return failure(
            source,
            'unsupported-format',
            `Character import format "${source.format}" is not supported by the M0 front-end importer yet.`,
        );
    }

    if (source.format === 'png') {
        return importPngCharacterCard(input, source);
    }

    return importJsonCharacterCard(input, source);
}

export function detectCharacterImportFormat(input: Pick<ReforgedCharacterImportInput, 'fileName' | 'mimeType'>): ReforgedCharacterImportFormat {
    const extension = getLowercaseExtension(input.fileName);

    if (extension === 'json') {
        return 'json';
    }

    if (extension === 'png') {
        return 'png';
    }

    if (extension === 'yaml' || extension === 'yml') {
        return 'yaml';
    }

    if (extension === 'charx') {
        return 'charx';
    }

    if (extension === 'byaf') {
        return 'byaf';
    }

    const mimeType = input.mimeType?.toLowerCase();

    if (mimeType === 'application/json' || mimeType?.endsWith('+json')) {
        return 'json';
    }

    if (mimeType === 'image/png') {
        return 'png';
    }

    return 'unknown';
}

function importJsonCharacterCard(
    input: ReforgedCharacterImportInput,
    source: ReforgedCharacterImportSource,
): ReforgedCharacterImportResult {
    const text = input.text ?? decodeUtf8Text(input.bytes);

    if (text === null) {
        return failure(source, 'missing-content', 'JSON character import requires text or UTF-8 bytes.');
    }

    try {
        JSON.parse(text);
    } catch {
        return failure(source, 'invalid-json', 'JSON character import content is not valid JSON.');
    }

    const card = parseCharacterCardJson(text);

    if (!isUsableCharacterCard(card)) {
        return failure(source, 'empty-character-card', 'JSON content did not contain a usable V2/V3 character card.');
    }

    return {
        ok: true,
        card,
        source,
        warnings: [],
    };
}

function importPngCharacterCard(
    input: ReforgedCharacterImportInput,
    source: ReforgedCharacterImportSource,
): ReforgedCharacterImportResult {
    if (!input.bytes) {
        return failure(source, 'missing-content', 'PNG character import requires binary bytes.');
    }

    const result = parseCharacterCardPng(input.bytes);

    if (result.card && isUsableCharacterCard(result.card)) {
        return {
            ok: true,
            card: result.card,
            source,
            warnings: result.reasons,
        };
    }

    return failure(
        source,
        getPngFailureCode(result.reasons),
        'PNG character import did not contain usable character metadata.',
        result.reasons,
    );
}

function createImportSource(input: ReforgedCharacterImportInput): ReforgedCharacterImportSource {
    return {
        fileName: input.fileName,
        format: detectCharacterImportFormat(input),
        mimeType: input.mimeType,
    };
}

function failure(
    source: ReforgedCharacterImportSource,
    code: ReforgedCharacterImportFailureCode,
    message: string,
    reasons: ReforgedCharacterCardPngParseReason[] = [],
): ReforgedCharacterImportFailure {
    return {
        ok: false,
        code,
        message,
        source,
        reasons,
    };
}

function decodeUtf8Text(bytes: CharacterImportBytes | undefined): string | null {
    if (!bytes) {
        return null;
    }

    const normalizedBytes = normalizeBytes(bytes);

    if (!normalizedBytes) {
        return null;
    }

    try {
        return TEXT_DECODER.decode(normalizedBytes);
    } catch {
        return null;
    }
}

function normalizeBytes(bytes: CharacterImportBytes): Uint8Array | null {
    if (bytes instanceof Uint8Array) {
        return bytes;
    }

    if (bytes instanceof ArrayBuffer) {
        return new Uint8Array(bytes);
    }

    if (Array.isArray(bytes)) {
        return Uint8Array.from(bytes);
    }

    return null;
}

function getPngFailureCode(reasons: ReforgedCharacterCardPngParseReason[]): ReforgedCharacterImportFailureCode {
    if (reasons.some((reason) => reason.code === 'keyword-not-found')) {
        return 'png-metadata-not-found';
    }

    return 'png-metadata-invalid';
}

function getLowercaseExtension(fileName: string): string {
    const match = /\.([^.]+)$/.exec(fileName.trim());
    return match?.[1]?.toLowerCase() ?? '';
}

function isUsableCharacterCard(card: ReforgedCharacterCard): boolean {
    return card.name.trim().length > 0 && card.source !== 'json-unknown';
}
