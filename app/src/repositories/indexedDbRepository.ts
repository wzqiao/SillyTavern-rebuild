import type {
    ReforgedEntityRepository,
    ReforgedKeyValueRepository,
    ReforgedPersistedEnvelope,
    ReforgedPersistenceGateway,
} from './types';

const DATABASE_NAME = 'st-reforged';
// v2: 新增 presets 实体库(M2 阶段二)。onupgradeneeded 按缺失补建,旧库无损升级。
const DATABASE_VERSION = 2;

const ENTITY_STORES = ['characters', 'worldbooks', 'chat-sessions', 'chat-messages', 'presets'] as const;
const KEY_VALUE_STORE = 'key-value';

type EntityStoreName = (typeof ENTITY_STORES)[number];

export class IndexedDbUnavailableError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'IndexedDbUnavailableError';
    }
}

export async function createIndexedDbPersistenceGateway(
    factory: IDBFactory | undefined = globalThis.indexedDB,
): Promise<ReforgedPersistenceGateway> {
    if (!factory) {
        throw new IndexedDbUnavailableError('IndexedDB is not available in this environment.');
    }

    const database = await openDatabase(factory);

    return {
        kind: 'indexed-db',
        characters: new IndexedDbEntityRepository(database, 'characters'),
        worldbooks: new IndexedDbEntityRepository(database, 'worldbooks'),
        chatSessions: new IndexedDbEntityRepository(database, 'chat-sessions'),
        chatMessages: new IndexedDbEntityRepository(database, 'chat-messages'),
        presets: new IndexedDbEntityRepository(database, 'presets'),
        keyValue: new IndexedDbKeyValueRepository(database),
    };
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        let request: IDBOpenDBRequest;

        try {
            request = factory.open(DATABASE_NAME, DATABASE_VERSION);
        } catch (error) {
            reject(new IndexedDbUnavailableError(describeError(error)));
            return;
        }

        request.onupgradeneeded = () => {
            const database = request.result;

            for (const storeName of ENTITY_STORES) {
                if (!database.objectStoreNames.contains(storeName)) {
                    database.createObjectStore(storeName, { keyPath: 'id' });
                }
            }

            if (!database.objectStoreNames.contains(KEY_VALUE_STORE)) {
                database.createObjectStore(KEY_VALUE_STORE, { keyPath: 'key' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new IndexedDbUnavailableError(describeError(request.error)));
        request.onblocked = () => reject(new IndexedDbUnavailableError('IndexedDB open request was blocked.'));
    });
}

class IndexedDbEntityRepository<T> implements ReforgedEntityRepository<T> {
    constructor(
        private readonly database: IDBDatabase,
        private readonly storeName: EntityStoreName,
    ) {}

    list(): Promise<Array<ReforgedPersistedEnvelope<T>>> {
        return runTransaction(this.database, this.storeName, 'readonly', (store) => {
            const request = store.getAll();
            return () => request.result as Array<ReforgedPersistedEnvelope<T>>;
        });
    }

    putMany(envelopes: Array<ReforgedPersistedEnvelope<T>>): Promise<void> {
        if (envelopes.length === 0) {
            return Promise.resolve();
        }

        return runTransaction(this.database, this.storeName, 'readwrite', (store) => {
            for (const envelope of envelopes) {
                store.put(toPlainValue(envelope));
            }
            return () => undefined;
        });
    }

    deleteMany(ids: string[]): Promise<void> {
        if (ids.length === 0) {
            return Promise.resolve();
        }

        return runTransaction(this.database, this.storeName, 'readwrite', (store) => {
            for (const id of ids) {
                store.delete(id);
            }
            return () => undefined;
        });
    }

    clear(): Promise<void> {
        return runTransaction(this.database, this.storeName, 'readwrite', (store) => {
            store.clear();
            return () => undefined;
        });
    }
}

class IndexedDbKeyValueRepository implements ReforgedKeyValueRepository {
    constructor(private readonly database: IDBDatabase) {}

    get<T>(key: string): Promise<T | null> {
        return runTransaction(this.database, KEY_VALUE_STORE, 'readonly', (store) => {
            const request = store.get(key);
            return () => {
                const record = request.result as { key: string; value: T } | undefined;
                return record ? record.value : null;
            };
        });
    }

    set<T>(key: string, value: T): Promise<void> {
        return runTransaction(this.database, KEY_VALUE_STORE, 'readwrite', (store) => {
            store.put({ key, value: toPlainValue(value) });
            return () => undefined;
        });
    }

    delete(key: string): Promise<void> {
        return runTransaction(this.database, KEY_VALUE_STORE, 'readwrite', (store) => {
            store.delete(key);
            return () => undefined;
        });
    }
}

function runTransaction<R>(
    database: IDBDatabase,
    storeName: string,
    mode: IDBTransactionMode,
    operate: (store: IDBObjectStore) => () => R,
): Promise<R> {
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, mode);
        const readResult = operate(transaction.objectStore(storeName));

        transaction.oncomplete = () => resolve(readResult());
        transaction.onerror = () => reject(new IndexedDbUnavailableError(describeError(transaction.error)));
        transaction.onabort = () => reject(new IndexedDbUnavailableError(describeError(transaction.error)));
    });
}

// Pinia state 是 reactive Proxy,IndexedDB 结构化克隆无法序列化 Proxy,先转纯对象。
function toPlainValue<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function describeError(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error ?? 'Unknown IndexedDB error');
}
