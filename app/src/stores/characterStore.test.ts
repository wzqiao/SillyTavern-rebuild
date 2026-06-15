import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useCharacterStore } from './characterStore';

const validJsonCard = JSON.stringify({
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
        name: 'Astra',
        first_mes: 'Coordinates locked.',
        tags: ['space'],
    },
});

describe('useCharacterStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('imports a character card and selects it automatically', () => {
        const store = useCharacterStore();

        const result = store.importCharacter({
            fileName: 'astra.json',
            text: validJsonCard,
            thumbnailDataUrl: 'data:image/webp;base64,thumb',
        }, '2026-06-09T00:00:00.000Z');

        expect(result.ok).toBe(true);
        expect(store.characters).toHaveLength(1);
        expect(store.characters[0]).toMatchObject({
            id: 'astra-astra-json-1',
            importedAt: '2026-06-09T00:00:00.000Z',
            card: {
                name: 'Astra',
                firstMessage: 'Coordinates locked.',
            },
            source: {
                fileName: 'astra.json',
                format: 'json',
            },
            warnings: [],
            thumbnailDataUrl: 'data:image/webp;base64,thumb',
        });
        expect(store.selectedCharacterId).toBe('astra-astra-json-1');
        expect(store.selectedCharacter?.card.name).toBe('Astra');
        expect(store.hasCharacters).toBe(true);
        expect(store.lastImportResult).toEqual(result);
    });

    it('stores failed import result without mutating the roster', () => {
        const store = useCharacterStore();

        const result = store.importCharacter({
            fileName: 'broken.json',
            text: '{not valid json',
        });

        expect(result).toMatchObject({
            ok: false,
            code: 'invalid-json',
        });
        expect(store.characters).toEqual([]);
        expect(store.selectedCharacter).toBeNull();
        expect(store.lastImportResult).toEqual(result);
    });

    it('selects and removes characters safely', () => {
        const store = useCharacterStore();
        store.importCharacter({
            fileName: 'astra.json',
            text: validJsonCard,
        }, '2026-06-09T00:00:00.000Z');
        store.importCharacter({
            fileName: 'mira.json',
            text: JSON.stringify({
                spec: 'chara_card_v3',
                spec_version: '3.0',
                data: {
                    name: 'Mira',
                    first_mes: 'The stacks remember everything.',
                },
            }),
        }, '2026-06-09T00:01:00.000Z');

        expect(store.selectedCharacterId).toBe('mira-mira-json-2');
        expect(store.selectCharacter('astra-astra-json-1')).toBe(true);
        expect(store.selectedCharacter?.card.name).toBe('Astra');
        expect(store.selectCharacter('missing')).toBe(false);
        expect(store.removeCharacter('astra-astra-json-1')).toBe(true);
        expect(store.characters.map((character) => character.card.name)).toEqual(['Mira']);
        expect(store.selectedCharacter?.card.name).toBe('Mira');
        expect(store.removeCharacter('missing')).toBe(false);
    });

    it('clears imported characters and resets local id generation', () => {
        const store = useCharacterStore();
        store.importCharacter({
            fileName: 'astra.json',
            text: validJsonCard,
        });

        store.clearCharacters();

        expect(store.characters).toEqual([]);
        expect(store.selectedCharacterId).toBeNull();
        expect(store.selectedCharacter).toBeNull();
        expect(store.lastImportResult).toBeNull();

        store.importCharacter({
            fileName: 'astra.json',
            text: validJsonCard,
        });
        expect(store.characters[0]?.id).toBe('astra-astra-json-1');
    });
});
