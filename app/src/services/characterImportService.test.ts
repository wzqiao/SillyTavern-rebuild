import { describe, expect, it } from 'vitest';
import { detectCharacterImportFormat, importCharacterCard } from './characterImportService';

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

function encodeText(value: string): Uint8Array {
    return new TextEncoder().encode(value);
}

function encodeBase64(value: string): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const bytes = encodeText(value);
    let output = '';

    for (let index = 0; index < bytes.length; index += 3) {
        const a = bytes[index];
        const b = index + 1 < bytes.length ? bytes[index + 1] : 0;
        const c = index + 2 < bytes.length ? bytes[index + 2] : 0;
        const chunk = (a << 16) | (b << 8) | c;

        output += alphabet[(chunk >> 18) & 63];
        output += alphabet[(chunk >> 12) & 63];
        output += index + 1 < bytes.length ? alphabet[(chunk >> 6) & 63] : '=';
        output += index + 2 < bytes.length ? alphabet[chunk & 63] : '=';
    }

    return output;
}

function uint32(value: number): Uint8Array {
    return Uint8Array.from([
        (value >>> 24) & 255,
        (value >>> 16) & 255,
        (value >>> 8) & 255,
        value & 255,
    ]);
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(total);
    let offset = 0;

    for (const part of parts) {
        output.set(part, offset);
        offset += part.length;
    }

    return output;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
    return concatBytes(
        uint32(data.length),
        encodeText(type),
        data,
        uint32(0),
    );
}

function createMinimalCharacterPng(keyword: string, text: string): Uint8Array {
    const ihdrData = Uint8Array.from([
        0, 0, 0, 1,
        0, 0, 0, 1,
        8,
        2,
        0,
        0,
        0,
    ]);

    return concatBytes(
        PNG_SIGNATURE,
        pngChunk('IHDR', ihdrData),
        pngChunk('tEXt', concatBytes(encodeText(keyword), Uint8Array.from([0]), encodeText(text))),
        pngChunk('IEND', new Uint8Array()),
    );
}

describe('detectCharacterImportFormat', () => {
    it('detects native ST character import extensions and JSON/PNG mime types', () => {
        expect(detectCharacterImportFormat({ fileName: 'card.JSON' })).toBe('json');
        expect(detectCharacterImportFormat({ fileName: 'card.png' })).toBe('png');
        expect(detectCharacterImportFormat({ fileName: 'card.yml' })).toBe('yaml');
        expect(detectCharacterImportFormat({ fileName: 'card.yaml' })).toBe('yaml');
        expect(detectCharacterImportFormat({ fileName: 'card.charx' })).toBe('charx');
        expect(detectCharacterImportFormat({ fileName: 'card.byaf' })).toBe('byaf');
        expect(detectCharacterImportFormat({ fileName: 'upload', mimeType: 'application/json' })).toBe('json');
        expect(detectCharacterImportFormat({ fileName: 'upload', mimeType: 'image/png' })).toBe('png');
        expect(detectCharacterImportFormat({ fileName: 'card.txt' })).toBe('unknown');
    });
});

describe('importCharacterCard', () => {
    it('imports a V2/V3 JSON character card from text', () => {
        const result = importCharacterCard({
            fileName: 'astra.json',
            text: JSON.stringify({
                spec: 'chara_card_v2',
                spec_version: '2.0',
                data: {
                    name: 'Astra',
                    first_mes: 'Coordinates locked.',
                },
            }),
        });

        expect(result).toMatchObject({
            ok: true,
            card: {
                name: 'Astra',
                firstMessage: 'Coordinates locked.',
                source: 'json-v2',
            },
            source: {
                fileName: 'astra.json',
                format: 'json',
            },
            warnings: [],
        });
    });

    it('imports a V1-style root JSON character card from text', () => {
        const result = importCharacterCard({
            fileName: 'legacy.json',
            text: JSON.stringify({
                name: 'Legacy Mira',
                description: 'Root-level legacy card description.',
                first_mes: 'Still here.',
            }),
        });

        expect(result).toMatchObject({
            ok: true,
            card: {
                name: 'Legacy Mira',
                description: 'Root-level legacy card description.',
                firstMessage: 'Still here.',
                source: 'json-v1-like',
                rawVersion: '1.0',
            },
            source: {
                fileName: 'legacy.json',
                format: 'json',
            },
            warnings: [],
        });
    });

    it('imports a PNG character card from base64 tEXt metadata', () => {
        const json = JSON.stringify({
            spec: 'chara_card_v3',
            spec_version: '3.0',
            data: {
                name: 'Mira',
                first_mes: 'You made it past the wards.',
            },
        });
        const png = createMinimalCharacterPng('ccv3', encodeBase64(json));

        const result = importCharacterCard({
            fileName: 'mira.png',
            mimeType: 'image/png',
            bytes: png,
        });

        expect(result).toMatchObject({
            ok: true,
            card: {
                name: 'Mira',
                firstMessage: 'You made it past the wards.',
                source: 'json-v3-like',
            },
            source: {
                fileName: 'mira.png',
                format: 'png',
                mimeType: 'image/png',
            },
        });
    });

    it('returns unsupported-format for native ST formats not implemented in the M0 front-end importer', () => {
        const result = importCharacterCard({
            fileName: 'archive.charx',
            bytes: Uint8Array.from([1, 2, 3]),
        });

        expect(result).toEqual({
            ok: false,
            code: 'unsupported-format',
            message: 'Character import format "charx" is not supported by the M0 front-end importer yet.',
            source: {
                fileName: 'archive.charx',
                format: 'charx',
                mimeType: undefined,
            },
            reasons: [],
        });
    });

    it('returns invalid-json for malformed JSON input', () => {
        const result = importCharacterCard({
            fileName: 'broken.json',
            text: '{not valid json',
        });

        expect(result).toMatchObject({
            ok: false,
            code: 'invalid-json',
            source: {
                fileName: 'broken.json',
                format: 'json',
            },
        });
    });

    it('returns png-metadata-not-found when a PNG has no character metadata', () => {
        const png = createMinimalCharacterPng('comment', 'hello');

        const result = importCharacterCard({
            fileName: 'plain.png',
            bytes: png,
        });

        expect(result).toMatchObject({
            ok: false,
            code: 'png-metadata-not-found',
            source: {
                fileName: 'plain.png',
                format: 'png',
            },
            reasons: [
                {
                    code: 'keyword-not-found',
                },
            ],
        });
    });
});
