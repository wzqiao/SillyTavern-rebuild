// DRAFT: 待主干评审

import type {
    ReforgedEntityRepository,
    ReforgedKeyValueRepository,
    ReforgedPersistedEnvelope,
    ReforgedPersistenceGateway,
} from './types';

class MemoryEntityRepository<T> implements ReforgedEntityRepository<T> {
    private readonly records = new Map<string, ReforgedPersistedEnvelope<T>>();

    async list(): Promise<Array<ReforgedPersistedEnvelope<T>>> {
        return [...this.records.values()].map((envelope) => structuredClone(envelope));
    }

    async putMany(envelopes: Array<ReforgedPersistedEnvelope<T>>): Promise<void> {
        for (const envelope of envelopes) {
            this.records.set(envelope.id, structuredClone(envelope));
        }
    }

    async deleteMany(ids: string[]): Promise<void> {
        for (const id of ids) {
            this.records.delete(id);
        }
    }

    async clear(): Promise<void> {
        this.records.clear();
    }
}

class MemoryKeyValueRepository implements ReforgedKeyValueRepository {
    private readonly entries = new Map<string, unknown>();

    async get<T>(key: string): Promise<T | null> {
        if (!this.entries.has(key)) {
            return null;
        }

        return structuredClone(this.entries.get(key)) as T;
    }

    async set<T>(key: string, value: T): Promise<void> {
        this.entries.set(key, structuredClone(value));
    }

    async delete(key: string): Promise<void> {
        this.entries.delete(key);
    }
}

export function createMemoryPersistenceGateway(): ReforgedPersistenceGateway {
    return {
        kind: 'memory',
        characters: new MemoryEntityRepository(),
        worldbooks: new MemoryEntityRepository(),
        chatSessions: new MemoryEntityRepository(),
        chatMessages: new MemoryEntityRepository(),
        presets: new MemoryEntityRepository(),
        keyValue: new MemoryKeyValueRepository(),
    };
}
