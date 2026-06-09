// DRAFT: 待主干评审

import type { ReforgedGenerationApi } from './engine';

// DRAFT: 待主干评审
export type ReforgedConnectionProvider = 'openai-compatible';

// DRAFT: 待主干评审
export type ReforgedConnectionDraftStatus = 'empty' | 'incomplete' | 'complete' | 'applied';

// DRAFT: 待主干评审
export type ReforgedConnectionRuntimeHandoffStatus =
    | 'empty'
    | 'incomplete'
    | 'complete-unapplied'
    | 'applied-but-unwired'
    | 'ready-to-attempt';

// DRAFT: 待主干评审
export type ReforgedConnectionRuntimeHandoffIssueCode =
    | 'draft-empty'
    | 'draft-incomplete'
    | 'draft-unapplied'
    | 'runtime-unwired'
    | 'runtime-connection-unwired';

// DRAFT: 待主干评审
export interface ReforgedConnectionSecretMetadata {
    hasValue: boolean;
    maskedValue: string;
}

// DRAFT: 待主干评审
export interface ReforgedConnectionDraft {
    provider: ReforgedConnectionProvider;
    baseUrl: string;
    model: string;
    apiKey: ReforgedConnectionSecretMetadata;
}

// DRAFT: 待主干评审
export interface ReforgedConnectionDraftPatch {
    provider?: ReforgedConnectionProvider;
    baseUrl?: string;
    model?: string;
    apiKey?: ReforgedConnectionSecretMetadata;
}

// DRAFT: 待主干评审
export interface ReforgedAppliedConnectionDraft extends ReforgedConnectionDraft {
    id: string;
    appliedAt: string;
}

// DRAFT: 待主干评审
export interface ReforgedConnectionValidationIssue {
    field: keyof ReforgedConnectionDraft;
    message: string;
}

// DRAFT: 待主干评审
export interface ReforgedConnectionRuntimeHandoffIssue {
    code: ReforgedConnectionRuntimeHandoffIssueCode;
    message: string;
    field?: keyof ReforgedConnectionDraft;
}

// DRAFT: 待主干评审
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

// DRAFT: 待主干评审
export interface ReforgedConnectionGenerationMapping {
    api: ReforgedGenerationApi;
}

// DRAFT: 待主干评审
export interface ReforgedConnectionResolvedRuntimeConfig extends ReforgedAppliedConnectionDraft {
    api: ReforgedGenerationApi;
}

// DRAFT: 待主干评审
export type ReforgedConnectionRuntimeRequestConfig =
    Omit<ReforgedConnectionResolvedRuntimeConfig, 'apiKey'> & {
        apiKey: string;
    };

// DRAFT: 待主干评审
export interface ReforgedConnectionRuntimeHandoffInput {
    runtimeAdapterReady?: boolean;
    runtimeDirectRequestReady?: boolean;
}

// DRAFT: 待主干评审
export interface ReforgedConnectionRuntimeHandoff {
    status: ReforgedConnectionRuntimeHandoffStatus;
    canAttempt: boolean;
    generation: ReforgedConnectionGenerationMapping;
    connection: ReforgedConnectionResolvedRuntimeConfig | null;
    takeRuntimeConnection: (() => ReforgedConnectionRuntimeRequestConfig | null) | null;
    issues: ReforgedConnectionRuntimeHandoffIssue[];
    message: string;
}
