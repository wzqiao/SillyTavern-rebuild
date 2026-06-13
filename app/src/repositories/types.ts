/**
 * 持久化仓储契约(M2 阶段一)。
 *
 * 实体以「信封」形式持久化:envelope 携带 revision/persistedAt,实体本身保持
 * 领域契约不变。revision 为联机同步预留——将来后端实现可用 since(revision)
 * 增量拉取,前端业务代码不感知存储介质。
 */

export interface ReforgedPersistedEnvelope<T> {
    id: string;
    revision: number;
    persistedAt: string;
    data: T;
}

export interface ReforgedEntityRepository<T> {
    list(): Promise<Array<ReforgedPersistedEnvelope<T>>>;
    putMany(envelopes: Array<ReforgedPersistedEnvelope<T>>): Promise<void>;
    deleteMany(ids: string[]): Promise<void>;
    clear(): Promise<void>;
}

export interface ReforgedKeyValueRepository {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
}

export type ReforgedPersistenceKind = 'indexed-db' | 'memory' | 'reforged-backend';

export interface ReforgedPersistenceGateway {
    kind: ReforgedPersistenceKind;
    characters: ReforgedEntityRepository<unknown>;
    worldbooks: ReforgedEntityRepository<unknown>;
    chatSessions: ReforgedEntityRepository<unknown>;
    chatMessages: ReforgedEntityRepository<unknown>;
    presets: ReforgedEntityRepository<unknown>;
    keyValue: ReforgedKeyValueRepository;
}
