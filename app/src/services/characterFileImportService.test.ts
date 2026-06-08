import { describe, expect, it, vi } from 'vitest';
import { createCharacterImportInputFromFile, type ReforgedCharacterImportFileLike } from './characterFileImportService';

describe('createCharacterImportInputFromFile', () => {
    it('reads PNG uploads as bytes when detected by extension', async () => {
        const bytes = new ArrayBuffer(3);
        const file = createFileLike({
            name: 'astra.PNG',
            type: '',
            text: '{"name":"wrong seam"}',
            bytes,
        });

        const input = await createCharacterImportInputFromFile(file);

        expect(input).toEqual({
            fileName: 'astra.PNG',
            mimeType: undefined,
            bytes,
        });
        expect(file.arrayBuffer).toHaveBeenCalledTimes(1);
        expect(file.text).not.toHaveBeenCalled();
    });

    it('reads PNG uploads as bytes when detected by mime type without an extension', async () => {
        const bytes = new ArrayBuffer(4);
        const file = createFileLike({
            name: 'upload',
            type: 'image/png',
            text: '{"name":"wrong seam"}',
            bytes,
        });

        const input = await createCharacterImportInputFromFile(file);

        expect(input).toEqual({
            fileName: 'upload',
            mimeType: 'image/png',
            bytes,
        });
        expect(file.arrayBuffer).toHaveBeenCalledTimes(1);
        expect(file.text).not.toHaveBeenCalled();
    });

    it('reads JSON uploads as text and preserves mime type', async () => {
        const text = '{"spec":"chara_card_v2","data":{"name":"Mira"}}';
        const file = createFileLike({
            name: 'mira.json',
            type: 'application/json',
            text,
            bytes: new ArrayBuffer(2),
        });

        const input = await createCharacterImportInputFromFile(file);

        expect(input).toEqual({
            fileName: 'mira.json',
            mimeType: 'application/json',
            text,
        });
        expect(file.text).toHaveBeenCalledTimes(1);
        expect(file.arrayBuffer).not.toHaveBeenCalled();
    });

    it('falls back to a stable file name for unnamed uploads', async () => {
        const file = createFileLike({
            name: '   ',
            type: 'application/json',
            text: '{}',
            bytes: new ArrayBuffer(1),
        });

        const input = await createCharacterImportInputFromFile(file);

        expect(input).toMatchObject({
            fileName: 'character-card',
            mimeType: 'application/json',
            text: '{}',
        });
    });
});

function createFileLike(input: {
    name: string;
    type: string;
    text: string;
    bytes: ArrayBuffer;
}): ReforgedCharacterImportFileLike {
    return {
        name: input.name,
        type: input.type,
        text: vi.fn(async () => input.text),
        arrayBuffer: vi.fn(async () => input.bytes),
    };
}
