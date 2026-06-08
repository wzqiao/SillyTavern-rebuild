import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useWorldbookStore } from './worldbookStore';

const validWorldbookJson = JSON.stringify({
    entries: {
        0: {
            uid: 0,
            key: ['nebula'],
            comment: 'Nebula route',
            content: 'The blue giant distorts local navigation.',
        },
    },
});

describe('useWorldbookStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('imports a worldbook and selects it automatically', () => {
        const store = useWorldbookStore();

        const result = store.importWorldbook({
            fileName: 'astra-routes.json',
            text: validWorldbookJson,
        }, '2026-06-09T00:00:00.000Z');

        expect(result.ok).toBe(true);
        expect(store.worldbooks).toHaveLength(1);
        expect(store.worldbooks[0]).toMatchObject({
            id: 'astra-routes-astra-routes-json-1',
            importedAt: '2026-06-09T00:00:00.000Z',
            worldbook: {
                name: 'astra-routes',
                source: 'sillytavern-world-info',
                entries: [
                    {
                        id: '0',
                        primaryKeys: ['nebula'],
                        content: 'The blue giant distorts local navigation.',
                    },
                ],
            },
            source: {
                fileName: 'astra-routes.json',
                format: 'json',
            },
            warnings: [],
        });
        expect(store.selectedWorldbookId).toBe('astra-routes-astra-routes-json-1');
        expect(store.selectedWorldbook?.worldbook.name).toBe('astra-routes');
        expect(store.hasWorldbooks).toBe(true);
        expect(store.lastImportResult).toEqual(result);
    });

    it('stores failed import result without mutating the library', () => {
        const store = useWorldbookStore();

        const result = store.importWorldbook({
            fileName: 'broken.json',
            text: '{not valid json',
        });

        expect(result).toMatchObject({
            ok: false,
            code: 'invalid-json',
        });
        expect(store.worldbooks).toEqual([]);
        expect(store.selectedWorldbook).toBeNull();
        expect(store.lastImportResult).toEqual(result);
    });

    it('selects and removes worldbooks safely', () => {
        const store = useWorldbookStore();
        store.importWorldbook({
            fileName: 'astra-routes.json',
            text: validWorldbookJson,
        }, '2026-06-09T00:00:00.000Z');
        store.importWorldbook({
            fileName: 'mira-archive.json',
            text: JSON.stringify({
                name: 'Mira Archive',
                entries: {
                    2: {
                        uid: 2,
                        key: ['archive'],
                        content: 'The stacks remember everything.',
                    },
                },
            }),
        }, '2026-06-09T00:01:00.000Z');

        expect(store.selectedWorldbookId).toBe('mira-archive-mira-archive-json-2');
        expect(store.selectWorldbook('astra-routes-astra-routes-json-1')).toBe(true);
        expect(store.selectedWorldbook?.worldbook.name).toBe('astra-routes');
        expect(store.selectWorldbook('missing')).toBe(false);
        expect(store.removeWorldbook('astra-routes-astra-routes-json-1')).toBe(true);
        expect(store.worldbooks.map((worldbook) => worldbook.worldbook.name)).toEqual(['Mira Archive']);
        expect(store.selectedWorldbook?.worldbook.name).toBe('Mira Archive');
        expect(store.removeWorldbook('missing')).toBe(false);
    });

    it('clears imported worldbooks and resets local id generation', () => {
        const store = useWorldbookStore();
        store.importWorldbook({
            fileName: 'astra-routes.json',
            text: validWorldbookJson,
        });

        store.clearWorldbooks();

        expect(store.worldbooks).toEqual([]);
        expect(store.selectedWorldbookId).toBeNull();
        expect(store.selectedWorldbook).toBeNull();
        expect(store.lastImportResult).toBeNull();

        store.importWorldbook({
            fileName: 'astra-routes.json',
            text: validWorldbookJson,
        });
        expect(store.worldbooks[0]?.id).toBe('astra-routes-astra-routes-json-1');
    });
});
