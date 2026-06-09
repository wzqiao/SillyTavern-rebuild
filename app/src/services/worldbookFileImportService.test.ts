import { describe, expect, it, vi } from 'vitest';
import { createWorldbookImportInputFromFile, type ReforgedWorldbookImportFileLike } from './worldbookFileImportService';

describe('createWorldbookImportInputFromFile', () => {
    it('reads worldbook JSON uploads as text and preserves mime type', async () => {
        const text = '{"entries":{"0":{"uid":0,"key":["star"],"content":"Star lore"}}}';
        const file = createFileLike({
            name: 'astra-routes.json',
            type: 'application/json',
            text,
        });

        const input = await createWorldbookImportInputFromFile(file);

        expect(input).toEqual({
            fileName: 'astra-routes.json',
            mimeType: 'application/json',
            text,
        });
        expect(file.text).toHaveBeenCalledTimes(1);
    });

    it('keeps unknown mime types so the import service can report unsupported formats', async () => {
        const file = createFileLike({
            name: 'lorebook.txt',
            type: 'text/plain',
            text: '{}',
        });

        await expect(createWorldbookImportInputFromFile(file)).resolves.toEqual({
            fileName: 'lorebook.txt',
            mimeType: 'text/plain',
            text: '{}',
        });
    });

    it('falls back to a stable file name for unnamed uploads', async () => {
        const file = createFileLike({
            name: '   ',
            type: '',
            text: '{}',
        });

        await expect(createWorldbookImportInputFromFile(file)).resolves.toEqual({
            fileName: 'worldbook',
            mimeType: undefined,
            text: '{}',
        });
    });
});

function createFileLike(input: {
    name: string;
    type: string;
    text: string;
}): ReforgedWorldbookImportFileLike {
    return {
        name: input.name,
        type: input.type,
        text: vi.fn(async () => input.text),
    };
}
