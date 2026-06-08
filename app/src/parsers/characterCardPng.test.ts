import { describe, expect, it } from 'vitest';

import { parseCharacterCardPng } from './characterCardPng';

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

function createMinimalPng(...chunks: Uint8Array[]): Uint8Array {
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
        ...chunks,
        pngChunk('IEND', new Uint8Array()),
    );
}

function textChunk(keyword: string, text: string): Uint8Array {
    return pngChunk('tEXt', concatBytes(encodeText(keyword), Uint8Array.from([0]), encodeText(text)));
}

function iTextChunk(keyword: string, text: string, compressionFlag = 0): Uint8Array {
    return pngChunk('iTXt', concatBytes(
        encodeText(keyword),
        Uint8Array.from([0, compressionFlag, 0, 0, 0]),
        encodeText(text),
    ));
}

function zTextChunk(keyword: string, compressedBytes: Uint8Array): Uint8Array {
    return pngChunk('zTXt', concatBytes(
        encodeText(keyword),
        Uint8Array.from([0, 0]),
        compressedBytes,
    ));
}

describe('parseCharacterCardPng', () => {
    it('parses direct JSON from a tEXt chunk', () => {
        const png = createMinimalPng(textChunk('chara', JSON.stringify({
            spec: 'chara_card_v2',
            spec_version: '2.0',
            data: {
                name: 'Astra',
                first_mes: 'Coordinates locked.',
                tags: ['space'],
            },
        })));

        const result = parseCharacterCardPng(png);

        expect(result).toEqual({
            card: {
                name: 'Astra',
                description: '',
                personality: '',
                scenario: '',
                firstMessage: 'Coordinates locked.',
                alternateGreetings: [],
                tags: ['space'],
                extensions: {},
                rawVersion: '2.0',
                source: 'json-v2',
            },
            chunkType: 'tEXt',
            keyword: 'chara',
            reasons: [],
        });
    });

    it('parses base64 JSON from an iTXt chunk via ArrayBuffer input', () => {
        const json = JSON.stringify({
            spec: 'chara_card_v3',
            spec_version: '3.1',
            data: {
                name: 'Mira',
                description: 'An archivist of forbidden songs.',
                firstMessage: 'You made it past the wards.',
                tags: ['archive', 'mystery'],
            },
        });
        const base64 = encodeBase64(json);
        const png = createMinimalPng(iTextChunk('Chara', base64));
        const buffer = new ArrayBuffer(png.byteLength);
        new Uint8Array(buffer).set(png);

        const result = parseCharacterCardPng(buffer);

        expect(result).toEqual({
            card: {
                name: 'Mira',
                description: 'An archivist of forbidden songs.',
                personality: '',
                scenario: '',
                firstMessage: 'You made it past the wards.',
                alternateGreetings: [],
                tags: ['archive', 'mystery'],
                extensions: {},
                rawVersion: '3.1',
                source: 'json-v3-like',
            },
            chunkType: 'iTXt',
            keyword: 'Chara',
            reasons: [],
        });
    });

    it('prefers ccv3 metadata over chara metadata regardless of chunk order', () => {
        const charaJson = JSON.stringify({
            spec: 'chara_card_v2',
            spec_version: '2.0',
            data: {
                name: 'Older card',
            },
        });
        const ccv3Json = JSON.stringify({
            spec: 'chara_card_v3',
            spec_version: '3.0',
            data: {
                name: 'Newer card',
                first_mes: 'Preferred greeting.',
            },
        });
        const png = createMinimalPng(
            textChunk('chara', encodeBase64(charaJson)),
            textChunk('ccv3', encodeBase64(ccv3Json)),
        );

        const result = parseCharacterCardPng(png);

        expect(result.card?.name).toBe('Newer card');
        expect(result.card?.firstMessage).toBe('Preferred greeting.');
        expect(result.chunkType).toBe('tEXt');
        expect(result.keyword).toBe('ccv3');
    });

    it('returns a clear reason when zTXt metadata cannot be decompressed', () => {
        const png = createMinimalPng(zTextChunk('ccv3', Uint8Array.from([120, 156, 75, 204])));

        const result = parseCharacterCardPng(Array.from(png));

        expect(result.card).toBeNull();
        expect(result.chunkType).toBeNull();
        expect(result.keyword).toBeNull();
        expect(result.reasons).toEqual([
            {
                code: 'compressed-metadata-unsupported',
                message: 'Found zTXt metadata for "ccv3", but zlib decompression is unavailable in this parser stub.',
                chunkType: 'zTXt',
                keyword: 'ccv3',
            },
        ]);
    });

    it('returns an empty result with a reason when no supported keyword exists', () => {
        const png = createMinimalPng(textChunk('comment', '{"name":"Ignored"}'));

        expect(parseCharacterCardPng(png)).toEqual({
            card: null,
            chunkType: null,
            keyword: null,
            reasons: [
                {
                    code: 'keyword-not-found',
                    message: 'No supported character card keyword was found in PNG text metadata.',
                },
            ],
        });
    });

    it('continues scanning after an unsupported compressed chunk and uses a later text chunk', () => {
        const png = createMinimalPng(
            zTextChunk('chara', Uint8Array.from([120, 156, 3, 0])),
            textChunk('ccv3', JSON.stringify({
                data: {
                    name: 'Sable',
                    alternate_greetings: 'Stay close.',
                    tags: 'noir, detective',
                },
            })),
        );

        const result = parseCharacterCardPng(png);

        expect(result.card).toEqual({
            name: 'Sable',
            description: '',
            personality: '',
            scenario: '',
            firstMessage: '',
            alternateGreetings: ['Stay close.'],
            tags: ['noir', 'detective'],
            extensions: {},
            rawVersion: '2.0',
            source: 'json-v2-like',
        });
        expect(result.chunkType).toBe('tEXt');
        expect(result.keyword).toBe('ccv3');
        expect(result.reasons).toEqual([
            {
                code: 'compressed-metadata-unsupported',
                message: 'Found zTXt metadata for "chara", but zlib decompression is unavailable in this parser stub.',
                chunkType: 'zTXt',
                keyword: 'chara',
            },
        ]);
    });
});
