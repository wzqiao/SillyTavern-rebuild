import { defineStore } from 'pinia';
import type {
    ReforgedAppliedConnectionDraft,
    ReforgedConnectionApplyResult,
    ReforgedConnectionDraft,
    ReforgedConnectionDraftStatus,
    ReforgedConnectionGenerationMapping,
    ReforgedConnectionResolvedRuntimeConfig,
    ReforgedConnectionRuntimeHandoff,
    ReforgedConnectionRuntimeHandoffInput,
    ReforgedConnectionValidationIssue,
} from '@/contracts/connection';

interface ConnectionStoreState {
    draft: ReforgedConnectionDraft;
    appliedDraft: ReforgedAppliedConnectionDraft | null;
    nextLocalId: number;
}

const emptyDraft = (): ReforgedConnectionDraft => ({
    provider: 'openai-compatible',
    baseUrl: '',
    model: '',
    apiKey: '',
});

export const useConnectionStore = defineStore('connection', {
    state: (): ConnectionStoreState => ({
        draft: emptyDraft(),
        appliedDraft: null,
        nextLocalId: 1,
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
            return maskSecret(state.appliedDraft?.apiKey ?? state.draft.apiKey);
        },

        generationApi(state): ReforgedConnectionGenerationMapping {
            return toGenerationMapping(state.draft.provider);
        },

        runtimeHandoff(state): (input?: ReforgedConnectionRuntimeHandoffInput) => ReforgedConnectionRuntimeHandoff {
            return (input = {}) => createRuntimeHandoff({
                appliedDraft: state.appliedDraft,
                draft: normalizeDraft(state.draft),
                runtimeConnectionInjected: input.runtimeConnectionInjected === true,
                runtimeAdapterReady: input.runtimeAdapterReady === true,
            });
        },
    },

    actions: {
        patchDraft(input: Partial<ReforgedConnectionDraft>): void {
            this.draft = normalizeDraft({
                ...this.draft,
                ...input,
                provider: 'openai-compatible',
            });
        },

        applyDraft(appliedAt = new Date().toISOString()): ReforgedConnectionApplyResult {
            const normalizedDraft = normalizeDraft(this.draft);
            const issues = validateDraft(normalizedDraft);

            if (issues.length > 0) {
                return {
                    ok: false,
                    issues,
                    message: issues[0]?.message ?? 'Connection draft is incomplete.',
                };
            }

            const existingId = this.appliedDraft?.id;
            const appliedDraft: ReforgedAppliedConnectionDraft = {
                ...normalizedDraft,
                id: existingId ?? `connection-draft-${this.nextLocalId}`,
                appliedAt,
            };

            if (!existingId) {
                this.nextLocalId += 1;
            }

            this.appliedDraft = appliedDraft;
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
                this.draft = emptyDraft();
                return;
            }

            this.draft = {
                provider: this.appliedDraft.provider,
                baseUrl: this.appliedDraft.baseUrl,
                model: this.appliedDraft.model,
                apiKey: this.appliedDraft.apiKey,
            };
        },

        clearApiKey(): void {
            this.draft.apiKey = '';
        },

        clearAll(): void {
            this.draft = emptyDraft();
            this.appliedDraft = null;
        },
    },
});

function normalizeDraft(draft: ReforgedConnectionDraft): ReforgedConnectionDraft {
    return {
        provider: 'openai-compatible',
        baseUrl: draft.baseUrl.trim().replace(/\/+$/g, ''),
        model: draft.model.trim(),
        apiKey: draft.apiKey.trim(),
    };
}

function createRuntimeHandoff(input: {
    appliedDraft: ReforgedAppliedConnectionDraft | null;
    draft: ReforgedConnectionDraft;
    runtimeAdapterReady: boolean;
    runtimeConnectionInjected: boolean;
}): ReforgedConnectionRuntimeHandoff {
    const generation = toGenerationMapping(input.draft.provider);
    const issues = validateDraft(input.draft);

    if (isDraftEmpty(input.draft)) {
        return {
            status: 'empty',
            canAttempt: false,
            generation,
            connection: null,
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
            issues: [{
                code: 'runtime-unwired',
                message: 'Runtime adapter is not ready; this applied draft has not been handed to a live request path.',
            }],
            message: 'Applied draft is memory-only and waiting for a ready Runtime adapter.',
        };
    }

    if (!input.runtimeConnectionInjected) {
        return {
            status: 'applied-but-unwired',
            canAttempt: false,
            generation,
            connection,
            issues: [{
                code: 'runtime-connection-unwired',
                message: 'Runtime adapter is ready, but the applied draft is not injected into SillyTavern request settings.',
            }],
            message: 'Runtime adapter is ready, but the applied connection draft is not wired into real requests yet.',
        };
    }

    return {
        status: 'ready-to-attempt',
        canAttempt: true,
        generation,
        connection,
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

    if (!draft.apiKey) {
        issues.push({
            field: 'apiKey',
            message: 'API key is required before this draft can be applied.',
        });
    }

    return issues;
}

function isDraftEmpty(draft: ReforgedConnectionDraft): boolean {
    return !draft.baseUrl.trim() && !draft.model.trim() && !draft.apiKey.trim();
}

function draftsMatch(appliedDraft: ReforgedAppliedConnectionDraft, draft: ReforgedConnectionDraft): boolean {
    return (
        appliedDraft.provider === draft.provider &&
        appliedDraft.baseUrl === draft.baseUrl &&
        appliedDraft.model === draft.model &&
        appliedDraft.apiKey === draft.apiKey
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

function maskSecret(value: string): string {
    if (!value) {
        return '';
    }

    if (value.length <= 8) {
        return '****';
    }

    return `${value.slice(0, 3)}****${value.slice(-4)}`;
}
