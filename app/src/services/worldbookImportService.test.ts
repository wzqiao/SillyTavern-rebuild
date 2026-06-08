import { describe, expect, it } from 'vitest';
import { detectWorldbookImportFormat, importWorldbook } from './worldbookImportService';

describe('detectWorldbookImportFormat', () => {
    it('detects JSON by extension or MIME type', () => {
        expect(detectWorldbookImportFormat({ fileName: 'lore.JSON' })).toBe('json');
        expect(detectWorldbookImportFormat({ fileName: 'upload', mimeType: 'application/json' })).toBe('json');
        expect(detectWorldbookImportFormat({ fileName: 'upload', mimeType: 'application/world+json' })).toBe('json');
        expect(detectWorldbookImportFormat({ fileName: 'lore.png', mimeType: 'image/png' })).toBe('unknown');
    });
});

describe('importWorldbook', () => {
    it('imports native SillyTavern world info JSON', () => {
        const result = importWorldbook({
            fileName: 'routes.json',
            text: JSON.stringify({
                entries: {
                    0: {
                        uid: 0,
                        key: ['nebula'],
                        comment: 'Nebula route',
                        content: 'The route is unstable.',
                        position: 0,
                    },
                },
            }),
        });

        expect(result).toMatchObject({
            ok: true,
            source: {
                fileName: 'routes.json',
                format: 'json',
            },
            worldbook: {
                name: 'routes',
                source: 'sillytavern-world-info',
                entries: [
                    {
                        id: '0',
                        primaryKeys: ['nebula'],
                        position: 'before',
                    },
                ],
            },
            warnings: [],
        });
    });

    it('returns missing-content for empty JSON uploads', () => {
        const result = importWorldbook({
            fileName: 'empty.json',
            text: '   ',
        });

        expect(result).toEqual({
            ok: false,
            code: 'missing-content',
            message: 'Worldbook JSON import requires text content.',
            source: {
                fileName: 'empty.json',
                format: 'json',
                mimeType: undefined,
            },
            warnings: [],
        });
    });

    it('returns invalid-json for malformed JSON', () => {
        const result = importWorldbook({
            fileName: 'broken.json',
            text: '{not valid json',
        });

        expect(result).toMatchObject({
            ok: false,
            code: 'invalid-json',
            message: 'Worldbook JSON is not valid JSON.',
        });
    });

    it('returns unsupported-format for non-worldbook JSON', () => {
        const result = importWorldbook({
            fileName: 'random.json',
            text: JSON.stringify({ hello: 'world' }),
        });

        expect(result).toMatchObject({
            ok: false,
            code: 'unsupported-format',
            message: 'Worldbook JSON is not a supported SillyTavern world info or Character Book shape.',
        });
    });

    it('returns unsupported-format for non-JSON files', () => {
        const result = importWorldbook({
            fileName: 'book.png',
            mimeType: 'image/png',
            text: '{}',
        });

        expect(result).toMatchObject({
            ok: false,
            code: 'unsupported-format',
            source: {
                format: 'unknown',
            },
        });
    });
});
