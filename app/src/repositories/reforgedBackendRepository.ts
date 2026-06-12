// DRAFT: 待主干评审

import type {
    ReforgedEntityRepository,
    ReforgedKeyValueRepository,
    ReforgedPersistedEnvelope,
    ReforgedPersistenceGateway,
} from './types';

/**
 * Reforged 后端存储网关(M2.5-B2):同一仓储契约的 HTTP 实现。
 * 服务端落盘,跨浏览器/设备共享;密钥不经此通道(见 ADR-006 与 localSecretsVault)。
 */

export interface ReforgedBackendGatewayOptions {
    baseUrl?: string;
    fetch?: typeof fetch;
}

export const DEFAULT_REFORGED_SERVER_URL = 'http://127.0.0.1:8787';

export class ReforgedBackendStorageError extends Error {
    constructor(message: string, public readonly status?: number) {
        super(message);
        this.name = 'ReforgedBackendStorageError';
    }
}

export async function probeReforgedBackend(
    options: ReforgedBackendGatewayOptions = {},
    timeoutMs = 800,
): Promise<boolean> {
    const fetcher = options.fetch ?? globalThis.fetch;
    const baseUrl = normalizeBaseUrl(options.baseUrl);

    if (typeof fetcher !== 'function') {
        return false;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetcher(`${baseUrl}/api/reforged/health`, { signal: controller.signal });
        return response.ok;
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
    }
}

export function createReforgedBackendPersistenceGateway(
    options: ReforgedBackendGatewayOptions = {},
): ReforgedPersistenceGateway {
    const fetcher = options.fetch ?? globalThis.fetch;
    const baseUrl = normalizeBaseUrl(options.baseUrl);

    if (typeof fetcher !== 'function') {
        throw new ReforgedBackendStorageError('Browser fetch() is required for the Reforged backend gateway.');
    }

    const request = async (path: string, init?: RequestInit): Promise<unknown> => {
        let response: Response;

        try {
            response = await fetcher(`${baseUrl}/api/reforged/storage${path}`, {
                headers: { 'Content-Type': 'application/json' },
                ...init,
            });
        } catch (error) {
            throw new ReforgedBackendStorageError(
                `Reforged backend storage request failed: ${error instanceof Error ? error.message : String(error)}`,
            );
        }

        if (!response.ok) {
            throw new ReforgedBackendStorageError(`Reforged backend storage returned HTTP ${response.status}.`, response.status);
        }

        return response.json().catch(() => null);
    };

    const entityRepository = <T>(storeName: string): ReforgedEntityRepository<T> => ({
        async list(): Promise<Array<ReforgedPersistedEnvelope<T>>> {
            const payload = await request(`/${storeName}`) as { envelopes?: Array<ReforgedPersistedEnvelope<T>> } | null;
            return payload?.envelopes ?? [];
        },

        async putMany(envelopes: Array<ReforgedPersistedEnvelope<T>>): Promise<void> {
            if (envelopes.length === 0) {
                return;
            }
            await request(`/${storeName}/put`, { method: 'POST', body: JSON.stringify({ envelopes }) });
        },

        async deleteMany(ids: string[]): Promise<void> {
            if (ids.length === 0) {
                return;
            }
            await request(`/${storeName}/delete`, { method: 'POST', body: JSON.stringify({ ids }) });
        },

        async clear(): Promise<void> {
            await request(`/${storeName}/clear`, { method: 'POST', body: '{}' });
        },
    });

    const keyValue: ReforgedKeyValueRepository = {
        async get<T>(key: string): Promise<T | null> {
            const payload = await request(`/kv/${encodeURIComponent(key)}`) as { value?: T | null } | null;
            return (payload?.value ?? null) as T | null;
        },

        async set<T>(key: string, value: T): Promise<void> {
            await request(`/kv/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify({ value }) });
        },

        async delete(key: string): Promise<void> {
            await request(`/kv/${encodeURIComponent(key)}`, { method: 'DELETE' });
        },
    };

    return {
        kind: 'reforged-backend',
        characters: entityRepository('characters'),
        worldbooks: entityRepository('worldbooks'),
        chatSessions: entityRepository('chat-sessions'),
        chatMessages: entityRepository('chat-messages'),
        presets: entityRepository('presets'),
        keyValue,
    };
}

function normalizeBaseUrl(baseUrl: string | undefined): string {
    return (baseUrl ?? readConfiguredServerUrl() ?? DEFAULT_REFORGED_SERVER_URL).replace(/\/+$/g, '');
}

/** B3 接 UI 前的轻量覆盖口:localStorage('st-reforged-server-url')。 */
export function readConfiguredServerUrl(): string | null {
    try {
        const value = globalThis.localStorage?.getItem('st-reforged-server-url');
        return value && value.trim() ? value.trim() : null;
    } catch {
        return null;
    }
}
