import type {
    ReforgedCharacterCard,
    ReforgedCharacterCardPngChunkType,
    ReforgedCharacterCardPngParseReason,
    ReforgedCharacterCardPngParseResult,
} from '@/contracts/character';

import { parseCharacterCardJson } from './characterCardJson';

type PngInput = ArrayBuffer | Uint8Array | readonly number[];
type JsonRecord = Record<string, unknown>;
type SupportedTextChunkType = Extract<ReforgedCharacterCardPngChunkType, 'tEXt' | 'iTXt' | 'zTXt'>;

interface ParsedTextChunk {
    keyword: string;
    text: string | null;
    reason: ReforgedCharacterCardPngParseReason | null;
}

interface ParsedCharacterCardPngCandidate {
    card: ReforgedCharacterCard;
    chunkType: SupportedTextChunkType;
    keyword: string;
    priority: number;
}

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_TEXT_CHUNK_TYPES: readonly SupportedTextChunkType[] = ['tEXt', 'iTXt', 'zTXt'];
const CHARACTER_CARD_KEYWORDS = new Set(['chara', 'ccv3']);
const BASE64_PREFIX_PATTERN = /^data:[^,]+;base64,/i;

function createParseResult(
    overrides: Partial<ReforgedCharacterCardPngParseResult> = {},
): ReforgedCharacterCardPngParseResult {
    return {
        card: null,
        chunkType: null,
        keyword: null,
        reasons: [],
        ...overrides,
    };
}

function createReason(
    code: ReforgedCharacterCardPngParseReason['code'],
    message: string,
    details: Partial<Omit<ReforgedCharacterCardPngParseReason, 'code' | 'message'>> = {},
): ReforgedCharacterCardPngParseReason {
    return {
        code,
        message,
        ...details,
    };
}

function normalizePngInput(input: PngInput): Uint8Array | null {
    if (input instanceof Uint8Array) {
        return input;
    }

    if (input instanceof ArrayBuffer) {
        return new Uint8Array(input);
    }

    if (Array.isArray(input)) {
        return Uint8Array.from(input);
    }

    return null;
}

function hasPngSignature(bytes: Uint8Array): boolean {
    if (bytes.length < PNG_SIGNATURE.length) {
        return false;
    }

    for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
        if (bytes[index] !== PNG_SIGNATURE[index]) {
            return false;
        }
    }

    return true;
}

function readUint32(bytes: Uint8Array, offset: number): number {
    return (
        (bytes[offset] * 16777216)
        + (bytes[offset + 1] << 16)
        + (bytes[offset + 2] << 8)
        + bytes[offset + 3]
    );
}

function decodeLatin1(bytes: Uint8Array): string {
    let value = '';

    for (const byte of bytes) {
        value += String.fromCharCode(byte);
    }

    return value;
}

function decodeUtf8(bytes: Uint8Array): string | null {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        return null;
    }
}

function decodeLooseText(bytes: Uint8Array): string {
    const utf8 = decodeUtf8(bytes);

    if (utf8 !== null) {
        return utf8;
    }

    return decodeLatin1(bytes);
}

function parseTextChunk(chunkType: SupportedTextChunkType, bytes: Uint8Array): ParsedTextChunk | null {
    const separator = bytes.indexOf(0);

    if (separator < 0) {
        return null;
    }

    const keyword = decodeLatin1(bytes.subarray(0, separator));

    if (chunkType === 'tEXt') {
        return {
            keyword,
            text: decodeLooseText(bytes.subarray(separator + 1)),
            reason: null,
        };
    }

    if (chunkType === 'zTXt') {
        const compressionMethod = bytes[separator + 1];

        return {
            keyword,
            text: null,
            reason: createReason(
                'compressed-metadata-unsupported',
                `Found ${chunkType} metadata for "${keyword}", but zlib decompression is unavailable in this parser stub.`,
                {
                    chunkType,
                    keyword,
                },
            ),
        };
    }

    const compressionFlagOffset = separator + 1;
    const compressionMethodOffset = separator + 2;

    if (compressionMethodOffset >= bytes.length) {
        return null;
    }

    const compressionFlag = bytes[compressionFlagOffset];
    const compressionMethod = bytes[compressionMethodOffset];
    let cursor = compressionMethodOffset + 1;

    while (cursor < bytes.length && bytes[cursor] !== 0) {
        cursor += 1;
    }

    if (cursor >= bytes.length) {
        return null;
    }

    cursor += 1;

    while (cursor < bytes.length && bytes[cursor] !== 0) {
        cursor += 1;
    }

    if (cursor >= bytes.length) {
        return null;
    }

    const textBytes = bytes.subarray(cursor + 1);

    if (compressionFlag === 1) {
        return {
            keyword,
            text: null,
            reason: createReason(
                'compressed-metadata-unsupported',
                `Found ${chunkType} metadata for "${keyword}" with compression flag ${compressionFlag} and method ${compressionMethod}, but zlib decompression is unavailable in this parser stub.`,
                {
                    chunkType,
                    keyword,
                },
            ),
        };
    }

    return {
        keyword,
        text: decodeUtf8(textBytes) ?? decodeLooseText(textBytes),
        reason: null,
    };
}

function isCharacterCardKeyword(keyword: string): boolean {
    return CHARACTER_CARD_KEYWORDS.has(keyword.toLowerCase());
}

function getCharacterCardKeywordPriority(keyword: string): number {
    return keyword.toLowerCase() === 'ccv3' ? 0 : 1;
}

function asRecord(value: unknown): JsonRecord | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    return value as JsonRecord;
}

function parseJsonRecord(text: string): JsonRecord | null {
    try {
        return asRecord(JSON.parse(text));
    } catch {
        return null;
    }
}

function decodeBase64Bytes(input: string): Uint8Array | null {
    const trimmed = input.replace(BASE64_PREFIX_PATTERN, '').replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');

    if (trimmed.length === 0) {
        return null;
    }

    const remainder = trimmed.length % 4;

    if (remainder === 1) {
        return null;
    }

    const padded = remainder === 0 ? trimmed : `${trimmed}${'='.repeat(4 - remainder)}`;
    const outputLength = Math.floor((padded.length / 4) * 3)
        - (padded.endsWith('==') ? 2 : padded.endsWith('=') ? 1 : 0);
    const output = new Uint8Array(outputLength);
    let outputIndex = 0;

    for (let index = 0; index < padded.length; index += 4) {
        const a = decodeBase64Char(padded[index]);
        const b = decodeBase64Char(padded[index + 1]);
        const c = padded[index + 2] === '=' ? 0 : decodeBase64Char(padded[index + 2]);
        const d = padded[index + 3] === '=' ? 0 : decodeBase64Char(padded[index + 3]);

        if (a < 0 || b < 0 || c < 0 || d < 0) {
            return null;
        }

        const chunk = (a << 18) | (b << 12) | (c << 6) | d;
        output[outputIndex] = (chunk >> 16) & 255;
        outputIndex += 1;

        if (padded[index + 2] !== '=') {
            output[outputIndex] = (chunk >> 8) & 255;
            outputIndex += 1;
        }

        if (padded[index + 3] !== '=') {
            output[outputIndex] = chunk & 255;
            outputIndex += 1;
        }
    }

    return output;
}

function decodeBase64Char(value: string): number {
    const code = value.charCodeAt(0);

    if (code >= 65 && code <= 90) {
        return code - 65;
    }

    if (code >= 97 && code <= 122) {
        return code - 71;
    }

    if (code >= 48 && code <= 57) {
        return code + 4;
    }

    if (value === '+') {
        return 62;
    }

    if (value === '/') {
        return 63;
    }

    return -1;
}

function parseEmbeddedCharacterCard(text: string): ReforgedCharacterCard | null {
    const trimmed = text.trim();

    if (trimmed.length === 0) {
        return null;
    }

    if (parseJsonRecord(trimmed)) {
        return parseCharacterCardJson(trimmed);
    }

    const decodedBytes = decodeBase64Bytes(trimmed);

    if (!decodedBytes) {
        return null;
    }

    const decodedText = decodeUtf8(decodedBytes) ?? decodeLooseText(decodedBytes);

    if (!parseJsonRecord(decodedText)) {
        return null;
    }

    return parseCharacterCardJson(decodedText);
}

export function parseCharacterCardPng(input: PngInput): ReforgedCharacterCardPngParseResult {
    const bytes = normalizePngInput(input);

    if (!bytes) {
        return createParseResult({
            reasons: [
                createReason(
                    'invalid-input',
                    'Expected PNG bytes as Uint8Array, ArrayBuffer, or number[] input.',
                ),
            ],
        });
    }

    if (!hasPngSignature(bytes)) {
        return createParseResult({
            reasons: [
                createReason(
                    'invalid-png-signature',
                    'Input does not start with a valid PNG signature.',
                ),
            ],
        });
    }

    const reasons: ReforgedCharacterCardPngParseReason[] = [];
    const candidates: ParsedCharacterCardPngCandidate[] = [];
    let offset = PNG_SIGNATURE.length;

    while (offset + 8 <= bytes.length) {
        const chunkLength = readUint32(bytes, offset);
        const chunkType = decodeLatin1(bytes.subarray(offset + 4, offset + 8));
        const chunkDataOffset = offset + 8;
        const chunkEnd = chunkDataOffset + chunkLength;
        const crcEnd = chunkEnd + 4;

        if (crcEnd > bytes.length) {
            return createParseResult({
                reasons: [
                    ...reasons,
                    createReason(
                        'invalid-png-chunk',
                        `Chunk "${chunkType}" exceeds the available PNG byte length.`,
                    ),
                ],
            });
        }

        if (PNG_TEXT_CHUNK_TYPES.includes(chunkType as SupportedTextChunkType)) {
            const parsedChunk = parseTextChunk(chunkType as SupportedTextChunkType, bytes.subarray(chunkDataOffset, chunkEnd));

            if (!parsedChunk) {
                reasons.push(createReason(
                    'invalid-png-chunk',
                    `Chunk "${chunkType}" could not be parsed as PNG text metadata.`,
                    {
                        chunkType: chunkType as SupportedTextChunkType,
                    },
                ));
            } else if (isCharacterCardKeyword(parsedChunk.keyword)) {
                if (parsedChunk.reason) {
                    reasons.push(parsedChunk.reason);
                } else if (parsedChunk.text !== null) {
                    const card = parseEmbeddedCharacterCard(parsedChunk.text);

                    if (card) {
                        candidates.push({
                            card,
                            chunkType: chunkType as SupportedTextChunkType,
                            keyword: parsedChunk.keyword,
                            priority: getCharacterCardKeywordPriority(parsedChunk.keyword),
                        });
                        offset = crcEnd;

                        if (chunkType === 'IEND') {
                            break;
                        }

                        continue;
                    }

                    reasons.push(createReason(
                        'metadata-not-json',
                        `Found ${chunkType} metadata for "${parsedChunk.keyword}", but it was neither JSON text nor base64-encoded JSON.`,
                        {
                            chunkType: chunkType as SupportedTextChunkType,
                            keyword: parsedChunk.keyword,
                        },
                    ));
                }
            }
        }

        offset = crcEnd;

        if (chunkType === 'IEND') {
            break;
        }
    }

    if (candidates.length > 0) {
        const [bestCandidate] = candidates.toSorted((left, right) => left.priority - right.priority);

        return createParseResult({
            card: bestCandidate.card,
            chunkType: bestCandidate.chunkType,
            keyword: bestCandidate.keyword,
            reasons,
        });
    }

    if (reasons.length === 0) {
        reasons.push(createReason(
            'keyword-not-found',
            'No supported character card keyword was found in PNG text metadata.',
        ));
    }

    return createParseResult({ reasons });
}
