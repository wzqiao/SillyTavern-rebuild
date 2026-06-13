import type { ReforgedGenerationApi } from './engine';

export type ReforgedConnectionProvider = 'openai-compatible';

export type ReforgedConnectionTransportMode = 'auto' | 'reforged-backend' | 'browser-direct' | 'legacy-proxy';

export type ReforgedConnectionDraftStatus = 'empty' | 'incomplete' | 'complete' | 'applied';

export type ReforgedConnectionRuntimeHandoffStatus =
    | 'empty'
    | 'incomplete'
    | 'complete-unapplied'
    | 'applied-but-unwired'
    | 'ready-to-attempt';

export type ReforgedConnectionRuntimeHandoffIssueCode =
    | 'draft-empty'
    | 'draft-incomplete'
    | 'draft-unapplied'
    | 'runtime-unwired'
    | 'runtime-connection-unwired';

export interface ReforgedConnectionSecretMetadata {
    hasValue: boolean;
    maskedValue: string;
}

export interface ReforgedConnectionDraft {
    provider: ReforgedConnectionProvider;
    baseUrl: string;
    model: string;
    apiKey: ReforgedConnectionSecretMetadata;
}

export interface ReforgedConnectionDraftPatch {
    provider?: ReforgedConnectionProvider;
    baseUrl?: string;
    model?: string;
    apiKey?: ReforgedConnectionSecretMetadata;
}

export interface ReforgedAppliedConnectionDraft extends ReforgedConnectionDraft {
    id: string;
    appliedAt: string;
}

export interface ReforgedConnectionValidationIssue {
    field: keyof ReforgedConnectionDraft;
    message: string;
}

export interface ReforgedConnectionRuntimeHandoffIssue {
    code: ReforgedConnectionRuntimeHandoffIssueCode;
    message: string;
    field?: keyof ReforgedConnectionDraft;
}

export type ReforgedConnectionApplyResult =
    | {
        ok: true;
        appliedDraft: ReforgedAppliedConnectionDraft;
        message: string;
    }
    | {
        ok: false;
        issues: ReforgedConnectionValidationIssue[];
        message: string;
    };

export interface ReforgedConnectionGenerationMapping {
    api: ReforgedGenerationApi;
}

export interface ReforgedConnectionResolvedRuntimeConfig extends ReforgedAppliedConnectionDraft {
    api: ReforgedGenerationApi;
}

export type ReforgedConnectionRuntimeRequestConfig =
    Omit<ReforgedConnectionResolvedRuntimeConfig, 'apiKey'> & {
        apiKey: string;
        transport: ReforgedConnectionTransportMode;
    };

export interface ReforgedConnectionRuntimeHandoffInput {
    runtimeAdapterReady?: boolean;
    runtimeDirectRequestReady?: boolean;
}

export interface ReforgedConnectionRuntimeHandoff {
    status: ReforgedConnectionRuntimeHandoffStatus;
    canAttempt: boolean;
    generation: ReforgedConnectionGenerationMapping;
    connection: ReforgedConnectionResolvedRuntimeConfig | null;
    takeRuntimeConnection: (() => ReforgedConnectionRuntimeRequestConfig | null) | null;
    issues: ReforgedConnectionRuntimeHandoffIssue[];
    message: string;
}

export type ReforgedConnectionProbeFailureCode = 'config' | 'cors-or-network' | 'http';

export interface ReforgedConnectionProbeResult {
    ok: boolean;
    code?: ReforgedConnectionProbeFailureCode;
    detail?: string;
    models?: string[];
    latencyMs?: number;
}
