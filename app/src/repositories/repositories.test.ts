import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createIndexedDbPersistenceGateway } from './indexedDbRepository';
import { createMemoryPersistenceGateway } from './memoryRepository';
import type { ReforgedPersistenceGateway } from './types';

interface SampleEntity {
    id: string;
    name: string;
}

const gatewayFactories: Array<[string, () => Promise<ReforgedPersistenceGateway>]> = [
    ['memory', async () => createMemoryPersistenceGateway()],
    ['indexed-db', () => createIndexedDbPersistenceGateway(new IDBFactory())],
];

describe.each(gatewayFactories)('persistence gateway contract (%s)', (kind, createGateway) => {
    it('reports its kind', async () => {
        const gateway = await createGateway();
        expect(gateway.kind).toBe(kind);
    });

    it('stores, lists, and deletes entity envelopes', async () => {
        const gateway = await createGateway();

        await gateway.characters.putMany([
            { id: 'a', revision: 1, persistedAt: '2026-06-12T00:00:00.000Z', data: { id: 'a', name: 'Alice' } },
            { id: 'b', revision: 1, persistedAt: '2026-06-12T00:00:00.000Z', data: { id: 'b', name: 'Bob' } },
        ]);

        let envelopes = await gateway.characters.list();
        expect(envelopes).toHaveLength(2);
        expect(envelopes.map((envelope) => (envelope.data as SampleEntity).name).sort()).toEqual(['Alice', 'Bob']);

        await gateway.characters.putMany([
            { id: 'a', revision: 2, persistedAt: '2026-06-12T00:01:00.000Z', data: { id: 'a', name: 'Alicia' } },
        ]);
        envelopes = await gateway.characters.list();
        const updated = envelopes.find((envelope) => envelope.id === 'a');
        expect(updated?.revision).toBe(2);
        expect((updated?.data as SampleEntity).name).toBe('Alicia');

        await gateway.characters.deleteMany(['b']);
        envelopes = await gateway.characters.list();
        expect(envelopes).toHaveLength(1);

        await gateway.characters.clear();
        expect(await gateway.characters.list()).toHaveLength(0);
    });

    it('keeps entity stores isolated from each other', async () => {
        const gateway = await createGateway();

        await gateway.characters.putMany([
            { id: 'a', revision: 1, persistedAt: '2026-06-12T00:00:00.000Z', data: { id: 'a', name: 'Alice' } },
        ]);

        expect(await gateway.worldbooks.list()).toHaveLength(0);
        expect(await gateway.chatSessions.list()).toHaveLength(0);
        expect(await gateway.chatMessages.list()).toHaveLength(0);
    });

    it('round-trips key-value entries', async () => {
        const gateway = await createGateway();

        expect(await gateway.keyValue.get('missing')).toBeNull();

        await gateway.keyValue.set('meta', { selected: 'a', count: 3 });
        expect(await gateway.keyValue.get('meta')).toEqual({ selected: 'a', count: 3 });

        await gateway.keyValue.set('meta', { selected: null, count: 0 });
        expect(await gateway.keyValue.get('meta')).toEqual({ selected: null, count: 0 });

        await gateway.keyValue.delete('meta');
        expect(await gateway.keyValue.get('meta')).toBeNull();
    });
});

describe('indexed-db gateway', () => {
    it('persists across gateway instances over the same factory', async () => {
        const factory = new IDBFactory();
        const first = await createIndexedDbPersistenceGateway(factory);
        await first.characters.putMany([
            { id: 'a', revision: 1, persistedAt: '2026-06-12T00:00:00.000Z', data: { id: 'a', name: 'Alice' } },
        ]);
        await first.keyValue.set('meta', { count: 1 });

        const second = await createIndexedDbPersistenceGateway(factory);
        expect(await second.characters.list()).toHaveLength(1);
        expect(await second.keyValue.get('meta')).toEqual({ count: 1 });
    });

    it('rejects when IndexedDB is unavailable', async () => {
        await expect(createIndexedDbPersistenceGateway(undefined)).rejects.toThrowError(
            /IndexedDB is not available/,
        );
    });
});
