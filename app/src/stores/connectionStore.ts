import { defineStore } from 'pinia';
import type {
    ReforgedAppliedConnectionDraft,
    ReforgedConnectionApplyResult,
    ReforgedConnectionDraft,
    ReforgedConnectionDraftPatch,
    ReforgedConnectionDraftStatus,
    ReforgedConnectionGenerationMapping,
    ReforgedConnectionResolvedRuntimeConfig,
    ReforgedConnectionRuntimeRequestConfig,
    ReforgedConnectionSecretMetadata,
    ReforgedConnectionTransportMode,
    ReforgedConnectionRuntimeHandoff,
    ReforgedConnectionRuntimeHandoffInput,
    ReforgedConnectionValidationIssue,
    ReforgedConnectionProbeResult,
} from '@/contracts/connection';
import { normalizeReforgedHttpBaseUrl, reforgedAuthHeaders } from '@/services/reforgedRuntimeClient';

interface ConnectionStoreState {
    draft: ReforgedConnectionDraft;
    appliedDraft: ReforgedAppliedConnectionDraft | null;
    transportMode: ReforgedConnectionTransportMode;
    nextLocalId: number;
    /** 探测结果与模型列表是会话级瞬态,不持久化。 */
    availableModels: string[];
    lastProbe: ReforgedConnectionProbeResult | null;
    probing: boolean;
}

const connectionSecretVault = new Map<string, string>();
const DRAFT_SECRET_SLOT = 'draft';

type DraftNormalizeInput = Omit<ReforgedConnectionDraft, 'apiKey'> & {
    apiKey: ReforgedConnectionDraft['apiKey'];
};

const emptyDraft = (): ReforgedConnectionDraft => ({
    provider: 'openai-compatible',
    baseUrl: '',
    model: '',
    apiKey: emptySecretMetadata(),
});

export const useConnectionStore = defineStore('connection', {
    state: (): ConnectionStoreState => ({
        draft: emptyDraft(),
        appliedDraft: null,
        transportMode: 'auto',
        nextLocalId: 1,
        availableModels: [],
        lastProbe: null,
        probing: false,
    }),

    getters: {
        draftErrors(state): ReforgedConnectionValidationIssue[] {
            return validateDraft(normalizeDraft(state.draft));
        },

        isDraftComplete(): boolean {
            return this.draftErrors.length === 0;
        },

        hasAppliedDraft(state): boolean {
            return state.appliedDraft !== null;
        },

        draftStatus(state): ReforgedConnectionDraftStatus {
            if (state.appliedDraft && draftsMatch(state.appliedDraft, normalizeDraft(state.draft))) {
                return 'applied';
            }

            if (isDraftEmpty(state.draft)) {
                return 'empty';
            }

            return this.draftErrors.length === 0 ? 'complete' : 'incomplete';
        },

        maskedApiKey(state): string {
            return state.appliedDraft?.apiKey.maskedValue || state.draft.apiKey.maskedValue;
        },

        generationApi(state): ReforgedConnectionGenerationMapping {
            return toGenerationMapping(state.draft.provider);
        },

        runtimeHandoff(state): (input?: ReforgedConnectionRuntimeHandoffInput) => ReforgedConnectionRuntimeHandoff {
            return (input = {}) => createRuntimeHandoff({
                appliedDraft: state.appliedDraft,
                draft: normalizeDraft(state.draft),
                transportMode: state.transportMode,
                runtimeDirectRequestReady: input.runtimeDirectRequestReady === true,
                runtimeAdapterReady: input.runtimeAdapterReady === true,
            });
        },
    },

    actions: {
        patchDraft(input: ReforgedConnectionDraftPatch): void {
            this.draft = normalizeDraftForEditing({
                ...this.draft,
                ...input,
                provider: 'openai-compatible',
            });
        },

        normalizeDraftFields(): void {
            this.draft = normalizeDraft(this.draft);
        },

        setTransportMode(mode: ReforgedConnectionTransportMode): void {
            this.transportMode = mode;
        },

        applyDraft(appliedAt = new Date().toISOString()): ReforgedConnectionApplyResult {
            const normalizedDraft = normalizeDraft(this.draft);
            this.draft = normalizedDraft;
            const issues = validateDraft(normalizedDraft);

            if (issues.length > 0) {
                return {
                    ok: false,
                    issues,
                    message: issues[0]?.message ?? 'Connection draft is incomplete.',
                };
            }

            const existingId = this.appliedDraft?.id;
            const appliedId = existingId ?? `connection-draft-${this.nextLocalId}`;
            const draftSecret = readVaultSecret(DRAFT_SECRET_SLOT);
            const secretIssue = validateDraftSecret(normalizedDraft, draftSecret);
            if (secretIssue) {
                return {
                    ok: false,
                    issues: [secretIssue],
                    message: secretIssue.message,
                };
            }

            const appliedDraft: ReforgedAppliedConnectionDraft = {
                ...normalizedDraft,
                id: appliedId,
                appliedAt,
            };

            if (!existingId) {
                this.nextLocalId += 1;
            }

            this.appliedDraft = appliedDraft;
            setVaultSecret(appliedSecretSlot(appliedDraft.id), draftSecret);
            this.draft = {
                provider: appliedDraft.provider,
                baseUrl: appliedDraft.baseUrl,
                model: appliedDraft.model,
                apiKey: appliedDraft.apiKey,
            };

            return {
                ok: true,
                appliedDraft,
                message: 'Draft applied in memory only. It has not been connectivity-tested or persisted.',
            };
        },

        resetDraft(): void {
            if (!this.appliedDraft) {
                clearVaultSecret(DRAFT_SECRET_SLOT);
                this.draft = emptyDraft();
                return;
            }

            this.draft = {
                provider: this.appliedDraft.provider,
                baseUrl: this.appliedDraft.baseUrl,
                model: this.appliedDraft.model,
                apiKey: this.appliedDraft.apiKey,
            };
            setVaultSecret(DRAFT_SECRET_SLOT, readVaultSecret(appliedSecretSlot(this.appliedDraft.id)));
        },

        clearApiKey(): void {
            clearVaultSecret(DRAFT_SECRET_SLOT);
            if (this.appliedDraft) {
                clearVaultSecret(appliedSecretSlot(this.appliedDraft.id));
                this.appliedDraft = null;
            }
            this.draft.apiKey = emptySecretMetadata();
        },

        /**
         * 连接测试 + 模型列表(A1/B3):新后端/auto 经 Reforged 代理 GET 上游模型,
         * 显式浏览器直连/旧代理则保留直接 GET {baseUrl}/models。
         * 拉不到列表不阻塞使用——模型仍可手填,生成走所选 transport。
         */
        async probeConnection(fetcher: typeof fetch = globalThis.fetch): Promise<ReforgedConnectionProbeResult> {
            const draft = normalizeDraft(this.draft);
            const apiKey = readVaultSecret(DRAFT_SECRET_SLOT);
            this.draft = draft;

            if (!draft.baseUrl || !apiKey) {
                return this.recordProbe({ ok: false, code: 'config' });
            }

            this.probing = true;
            const startedAt = Date.now();

            try {
                const response = await probeModels(draft, apiKey, this.transportMode, fetcher)
                    .catch((error: unknown) => this.recordProbe({
                        ok: false,
                        code: 'cors-or-network',
                        detail: error instanceof Error ? error.message : String(error),
                    }));

                if (!(response instanceof Response)) {
                    return response;
                }

                const latencyMs = Date.now() - startedAt;

                if (!response.ok) {
                    return this.recordProbe({
                        ok: false,
                        code: 'http',
                        detail: await readProbeErrorDetail(response),
                        latencyMs,
                    });
                }

                const models = readModelIds(await response.json().catch(() => null));
                this.availableModels = models;
                return this.recordProbe({ ok: true, models, latencyMs });
            } finally {
                this.probing = false;
            }
        },

        recordProbe(result: ReforgedConnectionProbeResult): ReforgedConnectionProbeResult {
            this.lastProbe = result;
            return result;
        },

        clearAll(): void {
            clearAllVaultSecrets();
            this.draft = emptyDraft();
            this.appliedDraft = null;
            this.transportMode = 'auto';
        },
    },
});

export function setConnectionDraftApiKeySecret(
    store: ReturnType<typeof useConnectionStore>,
    value: string,
): void {
    setVaultSecret(DRAFT_SECRET_SLOT, value);
    store.patchDraft({
        apiKey: createSecretMetadata(value),
    });
}

export function resetConnectionSecretVaultForTest(): void {
    clearAllVaultSecrets();
}

// 持久化接线(M2):金库刻意不进 reactive state,导出/恢复只供仓储层快照使用。
export function exportConnectionSecretsForPersistence(): Record<string, string> {
    return Object.fromEntries(connectionSecretVault);
}

export function restoreConnectionSecretsFromPersistence(secrets: Record<string, string>): void {
    clearAllVaultSecrets();
    for (const [slot, secret] of Object.entries(secrets)) {
        if (typeof secret === 'string' && secret.length > 0) {
            connectionSecretVault.set(slot, secret);
        }
    }
}

function normalizeDraft(draft: DraftNormalizeInput): ReforgedConnectionDraft {
    return {
        provider: 'openai-compatible',
        baseUrl: normalizeBaseUrlInput(draft.baseUrl),
        model: draft.model.trim(),
        apiKey: draft.apiKey,
    };
}

function normalizeDraftForEditing(draft: DraftNormalizeInput): ReforgedConnectionDraft {
    return {
        provider: 'openai-compatible',
        baseUrl: draft.baseUrl.trim(),
        model: draft.model.trim(),
        apiKey: draft.apiKey,
    };
}

function normalizeBaseUrlInput(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
        return '';
    }

    const hasExplicitScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed);
    if (hasExplicitScheme && !/^https?:\/\//i.test(trimmed)) {
        return trimmed.replace(/\/+$/g, '');
    }

    const withProtocol = withDefaultWebProtocol(trimmed);
    let url: URL;
    try {
        url = new URL(withProtocol);
    } catch {
        return trimmed.replace(/\/+$/g, '');
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return trimmed.replace(/\/+$/g, '');
    }

    url.hash = '';
    url.search = '';

    const segments = url.pathname.split('/').filter(Boolean);
    removeKnownEndpointSuffix(segments);
    if (segments.length === 0) {
        segments.push('v1');
    }

    url.pathname = `/${segments.join('/')}`;
    return url.toString().replace(/\/+$/g, '');
}

function withDefaultWebProtocol(value: string): string {
    if (/^\/\//.test(value)) {
        return `https:${value}`;
    }

    if (/^https?:\/\//i.test(value)) {
        return value;
    }

    return `${shouldDefaultToHttp(value) ? 'http' : 'https'}://${value}`;
}

function shouldDefaultToHttp(value: string): boolean {
    return /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::|\/|$)/i.test(value);
}

function removeKnownEndpointSuffix(segments: string[]): void {
    const lower = segments.map((segment) => segment.toLowerCase());
    const endpointSuffixes = [
        ['chat', 'completions'],
        ['images', 'generations'],
        ['images', 'edits'],
        ['audio', 'speech'],
        ['audio', 'transcriptions'],
        ['audio', 'translations'],
        ['completions'],
        ['responses'],
        ['embeddings'],
        ['models'],
    ];

    for (const suffix of endpointSuffixes) {
        if (
            lower.length >= suffix.length &&
            suffix.every((segment, index) => lower[lower.length - suffix.length + index] === segment)
        ) {
            segments.splice(segments.length - suffix.length, suffix.length);
            return;
        }
    }
}

function createRuntimeHandoff(input: {
    appliedDraft: ReforgedAppliedConnectionDraft | null;
    draft: ReforgedConnectionDraft;
    transportMode: ReforgedConnectionTransportMode;
    runtimeAdapterReady: boolean;
    runtimeDirectRequestReady: boolean;
}): ReforgedConnectionRuntimeHandoff {
    const generation = toGenerationMapping(input.draft.provider);
    const issues = validateDraft(input.draft);

    if (isDraftEmpty(input.draft)) {
        return {
            status: 'empty',
            canAttempt: false,
            generation,
            connection: null,
            takeRuntimeConnection: null,
            issues: [{
                code: 'draft-empty',
                message: 'Add an OpenAI-compatible draft before attempting Runtime mode.',
            }],
            message: 'No connection draft is available for Runtime mode.',
        };
    }

    if (issues.length > 0) {
        return {
            status: 'incomplete',
            canAttempt: false,
            generation,
            connection: null,
            takeRuntimeConnection: null,
            issues: issues.map((issue) => ({
                code: 'draft-incomplete',
                field: issue.field,
                message: issue.message,
            })),
            message: issues[0]?.message ?? 'Connection draft is incomplete.',
        };
    }

    if (!input.appliedDraft || !draftsMatch(input.appliedDraft, input.draft)) {
        return {
            status: 'complete-unapplied',
            canAttempt: false,
            generation,
            connection: null,
            takeRuntimeConnection: null,
            issues: [{
                code: 'draft-unapplied',
                message: 'Apply this complete draft before attempting Runtime mode.',
            }],
            message: 'Draft is complete, but it has not been applied to the runtime handoff.',
        };
    }

    const connection = toResolvedRuntimeConfig(input.appliedDraft);

    if (!input.runtimeAdapterReady) {
        return {
            status: 'applied-but-unwired',
            canAttempt: false,
            generation,
            connection,
            takeRuntimeConnection: null,
            issues: [{
                code: 'runtime-unwired',
                message: 'Runtime adapter is not ready; this applied draft has not been handed to a live request path.',
            }],
            message: 'Applied draft is memory-only and waiting for a ready Runtime adapter.',
        };
    }

    if (!input.runtimeDirectRequestReady) {
        return {
            status: 'applied-but-unwired',
            canAttempt: false,
            generation,
            connection,
            takeRuntimeConnection: null,
            issues: [{
                code: 'runtime-connection-unwired',
                message: 'Runtime adapter is ready, but the direct backend request path is not available.',
            }],
            message: 'Runtime adapter is ready, but this build cannot materialize a direct backend request yet.',
        };
    }

    const takeRuntimeConnection = createRuntimeConnectionTaker(connection, input.transportMode);
    if (!takeRuntimeConnection) {
        return {
            status: 'applied-but-unwired',
            canAttempt: false,
            generation,
            connection,
            takeRuntimeConnection: null,
            issues: [{
                code: 'runtime-connection-unwired',
                field: 'apiKey',
                message: 'Runtime adapter is ready, but the applied API key is no longer available in memory.',
            }],
            message: 'Applied API key is no longer available in memory. Re-enter it and apply the draft again.',
        };
    }

    return {
        status: 'ready-to-attempt',
        canAttempt: true,
        generation,
        connection,
        takeRuntimeConnection,
        issues: [],
        message: 'Applied draft is available for a Runtime request attempt, but it is still not persisted or connectivity-tested.',
    };
}

function validateDraft(draft: ReforgedConnectionDraft): ReforgedConnectionValidationIssue[] {
    const issues: ReforgedConnectionValidationIssue[] = [];

    if (!draft.baseUrl) {
        issues.push({
            field: 'baseUrl',
            message: 'Base URL is required.',
        });
    } else if (!/^https?:\/\//.test(draft.baseUrl)) {
        issues.push({
            field: 'baseUrl',
            message: 'Base URL must start with http:// or https://.',
        });
    }

    if (!draft.model) {
        issues.push({
            field: 'model',
            message: 'Model id is required.',
        });
    }

    if (!draft.apiKey.hasValue) {
        issues.push({
            field: 'apiKey',
            message: 'API key is required before this draft can be applied.',
        });
    }

    return issues;
}

function validateDraftSecret(
    draft: ReforgedConnectionDraft,
    secret: string,
): ReforgedConnectionValidationIssue | null {
    if (!draft.apiKey.hasValue || secret) {
        return null;
    }

    return {
        field: 'apiKey',
        message: 'API key metadata exists, but the memory-only secret is no longer available.',
    };
}

function isDraftEmpty(draft: ReforgedConnectionDraft): boolean {
    return !draft.baseUrl.trim() && !draft.model.trim() && !draft.apiKey.hasValue;
}

function draftsMatch(appliedDraft: ReforgedAppliedConnectionDraft, draft: ReforgedConnectionDraft): boolean {
    const appliedSecret = readVaultSecret(appliedSecretSlot(appliedDraft.id));
    const draftSecret = readVaultSecret(DRAFT_SECRET_SLOT);

    return (
        appliedDraft.provider === draft.provider &&
        appliedDraft.baseUrl === draft.baseUrl &&
        appliedDraft.model === draft.model &&
        appliedDraft.apiKey.hasValue === draft.apiKey.hasValue &&
        (!draft.apiKey.hasValue || (appliedSecret.length > 0 && appliedSecret === draftSecret))
    );
}

function toGenerationMapping(provider: ReforgedConnectionDraft['provider']): ReforgedConnectionGenerationMapping {
    if (provider === 'openai-compatible') {
        return {
            api: 'openai',
        };
    }

    return {
        api: 'openai',
    };
}

function toResolvedRuntimeConfig(appliedDraft: ReforgedAppliedConnectionDraft): ReforgedConnectionResolvedRuntimeConfig {
    return {
        ...appliedDraft,
        ...toGenerationMapping(appliedDraft.provider),
    };
}

async function probeModels(
    draft: ReforgedConnectionDraft,
    apiKey: string,
    transportMode: ReforgedConnectionTransportMode,
    fetcher: typeof fetch,
): Promise<Response> {
    if (transportMode === 'reforged-backend' || transportMode === 'auto') {
        try {
            return await fetcher(`${normalizeReforgedHttpBaseUrl(undefined)}/api/reforged/models`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                    ...reforgedAuthHeaders(),
                },
                body: JSON.stringify({
                    baseUrl: draft.baseUrl.replace(/\/+$/g, ''),
                }),
            });
        } catch (error) {
            if (transportMode === 'reforged-backend') {
                throw error;
            }
        }
    }

    return fetcher(`${draft.baseUrl.replace(/\/+$/g, '')}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
}

function createRuntimeConnectionTaker(
    connection: ReforgedConnectionResolvedRuntimeConfig,
    transportMode: ReforgedConnectionTransportMode,
): (() => ReforgedConnectionRuntimeRequestConfig | null) | null {
    const slot = appliedSecretSlot(connection.id);
    if (!readVaultSecret(slot)) {
        return null;
    }

    let used = false;

    return () => {
        if (used) {
            return null;
        }

        used = true;
        const apiKey = readVaultSecret(slot);
        if (!apiKey) {
            return null;
        }

        return {
            ...connection,
            apiKey,
            transport: transportMode,
        };
    };
}

function emptySecretMetadata(): ReforgedConnectionSecretMetadata {
    return {
        hasValue: false,
        maskedValue: '',
    };
}

function createSecretMetadata(value: string): ReforgedConnectionSecretMetadata {
    const secret = value.trim();
    return {
        hasValue: secret.length > 0,
        maskedValue: maskSecret(secret),
    };
}

function setVaultSecret(slot: string, value: string): void {
    const secret = value.trim();
    if (!secret) {
        clearVaultSecret(slot);
        return;
    }

    connectionSecretVault.set(slot, secret);
}

function readVaultSecret(slot: string): string {
    return connectionSecretVault.get(slot) ?? '';
}

function clearVaultSecret(slot: string): void {
    connectionSecretVault.delete(slot);
}

function clearAllVaultSecrets(): void {
    connectionSecretVault.clear();
}

function appliedSecretSlot(id: string): string {
    return `applied:${id}`;
}

function maskSecret(value: string): string {
    if (!value) {
        return '';
    }

    if (value.length <= 8) {
        return '****';
    }

    return `${value.slice(0, 3)}****${value.slice(-4)}`;
}

function readModelIds(payload: unknown): string[] {
    const list = Array.isArray(payload)
        ? payload
        : payload && typeof payload === 'object' && Array.isArray((payload as Record<string, unknown>).data)
            ? (payload as { data: unknown[] }).data
            : payload && typeof payload === 'object' && Array.isArray((payload as Record<string, unknown>).models)
                ? (payload as { models: unknown[] }).models
                : [];

    const ids = list
        .map((item) => {
            if (typeof item === 'string') {
                return item;
            }
            if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).id === 'string') {
                return (item as { id: string }).id;
            }
            return '';
        })
        .filter((id) => id.length > 0);

    return [...new Set(ids)].sort((left, right) => left.localeCompare(right));
}

async function readProbeErrorDetail(response: Response): Promise<string> {
    const fallback = `HTTP ${response.status}`;

    try {
        const payload = await response.clone().json();
        if (payload && typeof payload === 'object') {
            const error = (payload as Record<string, unknown>).error;
            if (typeof error === 'string' && error.trim()) {
                return error.trim();
            }
            if (error && typeof error === 'object' && typeof (error as Record<string, unknown>).message === 'string') {
                return ((error as Record<string, unknown>).message as string).trim() || fallback;
            }
        }
    } catch {
        // Non-JSON provider/proxy errors keep the status-only fallback.
    }

    return fallback;
}
