// DRAFT: 待主干评审

import type { Pinia } from 'pinia';
import type {
    ReforgedEntityRepository,
    ReforgedPersistenceGateway,
    ReforgedPersistedEnvelope,
    ReforgedPersistenceKind,
} from './types';
import { createIndexedDbPersistenceGateway } from './indexedDbRepository';
import { createMemoryPersistenceGateway } from './memoryRepository';
import {
    exportConnectionSecretsForPersistence,
    restoreConnectionSecretsFromPersistence,
    useCharacterStore,
    useChatStore,
    useConnectionStore,
    usePresetStore,
    useWorldbookStore,
} from '@/stores';
import type { ReforgedChatMessage, ReforgedChatSession } from '@/contracts/chat';

const KV_CHARACTERS_META = 'characters.meta';
const KV_WORLDBOOKS_META = 'worldbooks.meta';
const KV_CHAT_META = 'chat.meta';
const KV_CONNECTION_STATE = 'connection.state';
const KV_PRESETS_META = 'presets.meta';

const DEFAULT_DEBOUNCE_MS = 250;

interface CharactersMeta {
    selectedCharacterId: string | null;
    nextLocalId: number;
}

interface WorldbooksMeta {
    selectedWorldbookId: string | null;
    nextLocalId: number;
}

interface ChatMeta {
    selectedSessionId: string | null;
    nextSessionLocalId: number;
    nextMessageLocalId: number;
    nextAlternativeLocalId: number;
    nextGenerationLocalId: number;
}

interface PresetsMeta {
    selectedPresetId: string | null;
    nextLocalId: number;
}

interface ConnectionPersistedState {
    draft: unknown;
    appliedDraft: unknown;
    transportMode?: string;
    nextLocalId: number;
    secrets: Record<string, string>;
}

export interface AppPersistenceOptions {
    debounceMs?: number;
}

export interface AppPersistenceController {
    kind: ReforgedPersistenceKind;
    flush(): Promise<void>;
    stop(): void;
}

let activeKind: ReforgedPersistenceKind | null = null;

export function getAppPersistenceKind(): ReforgedPersistenceKind | null {
    return activeKind;
}

/**
 * 应用启动入口:优先 IndexedDB,不可用(隐私模式/配额/无 API)降级为内存网关。
 * 返回的 controller 已完成水合并开始订阅回写。
 */
export async function startAppPersistence(
    pinia: Pinia,
    options: AppPersistenceOptions = {},
): Promise<AppPersistenceController> {
    let gateway: ReforgedPersistenceGateway;

    try {
        gateway = await createIndexedDbPersistenceGateway();
    } catch (error) {
        console.warn('[st-reforged] IndexedDB unavailable, falling back to in-memory persistence.', error);
        gateway = createMemoryPersistenceGateway();
    }

    const controller = await createAppPersistenceController(pinia, gateway, options);
    activeKind = controller.kind;
    return controller;
}

/**
 * 水合四个领域 store 并订阅回写。测试可注入任意网关。
 */
export async function createAppPersistenceController(
    pinia: Pinia,
    gateway: ReforgedPersistenceGateway,
    options: AppPersistenceOptions = {},
): Promise<AppPersistenceController> {
    const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    const characterStore = useCharacterStore(pinia);
    const worldbookStore = useWorldbookStore(pinia);
    const chatStore = useChatStore(pinia);
    const connectionStore = useConnectionStore(pinia);
    const presetStore = usePresetStore(pinia);

    const characterSync = new EntitySync(gateway.characters as ReforgedEntityRepository<{ id: string }>);
    const worldbookSync = new EntitySync(gateway.worldbooks as ReforgedEntityRepository<{ id: string }>);
    const presetSync = new EntitySync(gateway.presets as ReforgedEntityRepository<{ id: string }>);
    const sessionSync = new EntitySync<ReforgedChatSession>(
        gateway.chatSessions as ReforgedEntityRepository<ReforgedChatSession>,
    );
    const messageSync = new EntitySync<ReforgedChatMessage>(
        gateway.chatMessages as ReforgedEntityRepository<ReforgedChatMessage>,
    );

    // ---- 水合(必须先于订阅,避免把初始空状态写回存储) ----

    const [characterEnvelopes, worldbookEnvelopes, sessionEnvelopes, messageEnvelopes, presetEnvelopes] = await Promise.all([
        characterSync.prime(),
        worldbookSync.prime(),
        sessionSync.prime(),
        messageSync.prime(),
        presetSync.prime(),
    ]);
    const [charactersMeta, worldbooksMeta, chatMeta, connectionState, presetsMeta] = await Promise.all([
        gateway.keyValue.get<CharactersMeta>(KV_CHARACTERS_META),
        gateway.keyValue.get<WorldbooksMeta>(KV_WORLDBOOKS_META),
        gateway.keyValue.get<ChatMeta>(KV_CHAT_META),
        gateway.keyValue.get<ConnectionPersistedState>(KV_CONNECTION_STATE),
        gateway.keyValue.get<PresetsMeta>(KV_PRESETS_META),
    ]);

    if (characterEnvelopes.length > 0 || charactersMeta) {
        characterStore.$patch({
            characters: characterEnvelopes.map((envelope) => envelope.data) as never[],
            selectedCharacterId: charactersMeta?.selectedCharacterId ?? null,
            nextLocalId: charactersMeta?.nextLocalId ?? characterEnvelopes.length + 1,
        });
    }

    if (worldbookEnvelopes.length > 0 || worldbooksMeta) {
        worldbookStore.$patch({
            worldbooks: worldbookEnvelopes.map((envelope) => envelope.data) as never[],
            selectedWorldbookId: worldbooksMeta?.selectedWorldbookId ?? null,
            nextLocalId: worldbooksMeta?.nextLocalId ?? worldbookEnvelopes.length + 1,
        });
    }

    if (sessionEnvelopes.length > 0 || chatMeta) {
        chatStore.$patch({
            sessions: sessionEnvelopes.map((envelope) => normalizeSession(envelope.data)),
            messages: messageEnvelopes.map((envelope) => normalizeMessage(envelope.data)),
            selectedSessionId: chatMeta?.selectedSessionId ?? null,
            nextSessionLocalId: chatMeta?.nextSessionLocalId ?? sessionEnvelopes.length + 1,
            nextMessageLocalId: chatMeta?.nextMessageLocalId ?? messageEnvelopes.length + 1,
            nextAlternativeLocalId: chatMeta?.nextAlternativeLocalId ?? 1,
            nextGenerationLocalId: chatMeta?.nextGenerationLocalId ?? 1,
        });
    }

    if (connectionState) {
        connectionStore.$patch({
            draft: connectionState.draft as never,
            appliedDraft: connectionState.appliedDraft as never,
            transportMode: (connectionState.transportMode as never) ?? 'auto',
            nextLocalId: connectionState.nextLocalId,
        });
        restoreConnectionSecretsFromPersistence(connectionState.secrets ?? {});
    }

    if (presetEnvelopes.length > 0 || presetsMeta) {
        presetStore.$patch({
            presets: presetEnvelopes.map((envelope) => envelope.data) as never[],
            selectedPresetId: presetsMeta?.selectedPresetId ?? null,
            nextLocalId: presetsMeta?.nextLocalId ?? presetEnvelopes.length + 1,
        });
    }

    // ---- 订阅回写(按领域防抖合并) ----

    const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const pendingWrites = new Map<string, () => Promise<void>>();
    let stopped = false;

    function schedule(domain: string, write: () => Promise<void>): void {
        if (stopped) {
            return;
        }

        pendingWrites.set(domain, write);
        const existing = pendingTimers.get(domain);
        if (existing) {
            clearTimeout(existing);
        }
        pendingTimers.set(domain, setTimeout(() => {
            pendingTimers.delete(domain);
            void runWrite(domain);
        }, debounceMs));
    }

    async function runWrite(domain: string): Promise<void> {
        const write = pendingWrites.get(domain);
        pendingWrites.delete(domain);

        if (!write) {
            return;
        }

        try {
            await write();
        } catch (error) {
            console.warn(`[st-reforged] Failed to persist ${domain}.`, error);
        }
    }

    async function flush(): Promise<void> {
        for (const timer of pendingTimers.values()) {
            clearTimeout(timer);
        }
        pendingTimers.clear();
        const domains = [...pendingWrites.keys()];
        await Promise.all(domains.map((domain) => runWrite(domain)));
    }

    const writeCharacters = async (): Promise<void> => {
        await characterSync.sync(characterStore.characters as Array<{ id: string }>);
        await gateway.keyValue.set<CharactersMeta>(KV_CHARACTERS_META, {
            selectedCharacterId: characterStore.selectedCharacterId,
            nextLocalId: characterStore.nextLocalId,
        });
    };

    const writeWorldbooks = async (): Promise<void> => {
        await worldbookSync.sync(worldbookStore.worldbooks as Array<{ id: string }>);
        await gateway.keyValue.set<WorldbooksMeta>(KV_WORLDBOOKS_META, {
            selectedWorldbookId: worldbookStore.selectedWorldbookId,
            nextLocalId: worldbookStore.nextLocalId,
        });
    };

    const writeChat = async (): Promise<void> => {
        await sessionSync.sync(chatStore.sessions);
        await messageSync.sync(chatStore.messages);
        await gateway.keyValue.set<ChatMeta>(KV_CHAT_META, {
            selectedSessionId: chatStore.selectedSessionId,
            nextSessionLocalId: chatStore.nextSessionLocalId,
            nextMessageLocalId: chatStore.nextMessageLocalId,
            nextAlternativeLocalId: chatStore.nextAlternativeLocalId,
            nextGenerationLocalId: chatStore.nextGenerationLocalId,
        });
    };

    const writeConnection = async (): Promise<void> => {
        await gateway.keyValue.set<ConnectionPersistedState>(KV_CONNECTION_STATE, {
            draft: JSON.parse(JSON.stringify(connectionStore.draft)),
            appliedDraft: connectionStore.appliedDraft
                ? JSON.parse(JSON.stringify(connectionStore.appliedDraft))
                : null,
            transportMode: connectionStore.transportMode,
            nextLocalId: connectionStore.nextLocalId,
            secrets: exportConnectionSecretsForPersistence(),
        });
    };

    const writePresets = async (): Promise<void> => {
        await presetSync.sync(presetStore.presets as Array<{ id: string }>);
        await gateway.keyValue.set<PresetsMeta>(KV_PRESETS_META, {
            selectedPresetId: presetStore.selectedPresetId,
            nextLocalId: presetStore.nextLocalId,
        });
    };

    // flush: 'sync' 确保变更立即进入防抖队列,避免「修改后立刻刷新」窗口期丢写。
    const unsubscribes = [
        characterStore.$subscribe(() => schedule('characters', writeCharacters), { detached: true, flush: 'sync' }),
        worldbookStore.$subscribe(() => schedule('worldbooks', writeWorldbooks), { detached: true, flush: 'sync' }),
        chatStore.$subscribe(() => schedule('chat', writeChat), { detached: true, flush: 'sync' }),
        connectionStore.$subscribe(() => schedule('connection', writeConnection), { detached: true, flush: 'sync' }),
        presetStore.$subscribe(() => schedule('presets', writePresets), { detached: true, flush: 'sync' }),
    ];

    const handleVisibilityChange = (): void => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
            void flush();
        }
    };

    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return {
        kind: gateway.kind,
        flush,
        stop(): void {
            stopped = true;
            for (const unsubscribe of unsubscribes) {
                unsubscribe();
            }
            for (const timer of pendingTimers.values()) {
                clearTimeout(timer);
            }
            pendingTimers.clear();
            pendingWrites.clear();
            if (typeof document !== 'undefined') {
                document.removeEventListener('visibilitychange', handleVisibilityChange);
            }
        },
    };
}

/**
 * 信封记账:对比上次持久化的序列化快照,变更则 revision+1,
 * 消失的 id 从存储删除。存储里因此天然带有增量同步所需的版本号。
 */
class EntitySync<T extends { id: string }> {
    private readonly snapshots = new Map<string, { revision: number; json: string }>();

    constructor(private readonly repository: ReforgedEntityRepository<T>) {}

    async prime(): Promise<Array<ReforgedPersistedEnvelope<T>>> {
        const envelopes = await this.repository.list();

        for (const envelope of envelopes) {
            this.snapshots.set(envelope.id, {
                revision: envelope.revision,
                json: JSON.stringify(envelope.data),
            });
        }

        return envelopes;
    }

    async sync(current: ReadonlyArray<T>, persistedAt = new Date().toISOString()): Promise<void> {
        const puts: Array<ReforgedPersistedEnvelope<T>> = [];
        const seen = new Set<string>();

        for (const item of current) {
            seen.add(item.id);
            const json = JSON.stringify(item);
            const previous = this.snapshots.get(item.id);

            if (previous && previous.json === json) {
                continue;
            }

            const revision = (previous?.revision ?? 0) + 1;
            // 信封携带纯对象副本——reactive Proxy 既不能 structuredClone 也不该进存储。
            puts.push({ id: item.id, revision, persistedAt, data: JSON.parse(json) as T });
            this.snapshots.set(item.id, { revision, json });
        }

        const removed = [...this.snapshots.keys()].filter((id) => !seen.has(id));
        for (const id of removed) {
            this.snapshots.delete(id);
        }

        await this.repository.putMany(puts);
        await this.repository.deleteMany(removed);
    }
}

function normalizeSession(session: ReforgedChatSession): ReforgedChatSession {
    return {
        ...session,
        participants: session.participants ?? ['local-user'],
    };
}

function normalizeMessage(message: ReforgedChatMessage): ReforgedChatMessage {
    const normalized: ReforgedChatMessage = {
        ...message,
        authorId: message.authorId ?? (message.role === 'user' ? 'local-user' : 'local-character'),
        seq: message.seq ?? 0,
    };

    // 页面在生成中途被刷新:不能让消息永远停在 generating。
    if (normalized.status === 'generating') {
        normalized.status = 'failed';
        normalized.error = {
            code: 'generation-cancelled',
            message: 'Generation was interrupted by a page reload.',
        };
    }

    return normalized;
}
