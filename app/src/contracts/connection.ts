// DRAFT: 待主干评审

import type { ReforgedGenerationApi } from './engine';

// DRAFT: 待主干评审
export type ReforgedConnectionProvider = 'openai-compatible';

// DRAFT: 待主干评审
export type ReforgedConnectionDraftStatus = 'empty' | 'incomplete' | 'complete' | 'applied';

// DRAFT: 待主干评审
export interface ReforgedConnectionDraft {
    provider: ReforgedConnectionProvider;
    baseUrl: string;
    model: string;
    apiKey: string;
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
