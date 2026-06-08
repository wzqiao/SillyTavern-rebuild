// DRAFT: 待主干评审

import type {
    HeadlessEngineAdapter,
    HeadlessChatCompletionRequest,
    HeadlessGenerationRequest,
    ReforgedChatCompletionMessage,
    ReforgedChatRole,
    ReforgedGenerationApi,
} from './engine';

// DRAFT: 待主干评审
export type ReforgedChatMessageRole = Extract<ReforgedChatRole, 'system' | 'user' | 'assistant'>;

// DRAFT: 待主干评审
export type ReforgedChatMessageStatus = 'sent' | 'generating' | 'failed';

// DRAFT: 待主干评审
export type ReforgedChatGenerationStatus = 'idle' | 'generating' | 'failed' | 'cancelled';

// DRAFT: 待主干评审
export type ReforgedChatErrorCode =
    | 'adapter-not-configured'
    | 'empty-message'
    | 'generation-cancelled'
    | 'generation-failed'
    | 'generation-in-progress'
    | 'session-not-found';

// DRAFT: 待主干评审
export interface ReforgedChatError {
    code: ReforgedChatErrorCode;
    message: string;
    detail?: string;
}

// DRAFT: 待主干评审
export interface ReforgedChatCharacterContext {
    id: string;
    name: string;
    description?: string;
    personality?: string;
    scenario?: string;
    firstMessage?: string;
}

// DRAFT: 待主干评审
export interface ReforgedChatMessageAlternative {
    id: string;
    content: string;
    createdAt: string;
}

// DRAFT: 待主干评审
export interface ReforgedChatMessage {
    id: string;
    sessionId: string;
    role: ReforgedChatMessageRole;
    content: string;
    createdAt: string;
    updatedAt?: string;
    status: ReforgedChatMessageStatus;
    error?: ReforgedChatError;
    alternatives: ReforgedChatMessageAlternative[];
    activeAlternativeIndex: number;
}

// DRAFT: 待主干评审
export interface ReforgedChatSession {
    id: string;
    character: ReforgedChatCharacterContext | null;
    title: string;
    createdAt: string;
    updatedAt: string;
    messageIds: string[];
}

// DRAFT: 待主干评审
export interface ReforgedChatGenerationOptions {
    api?: ReforgedGenerationApi | null;
    instructOverride?: boolean;
    quietToLoud?: boolean;
    responseLength?: number | null;
    trimNames?: boolean;
    prefill?: string;
    jsonSchema?: HeadlessGenerationRequest['jsonSchema'];
    systemPrompt?: string;
}

// DRAFT: 待主干评审
export interface ReforgedChatStartSessionInput {
    character?: ReforgedChatCharacterContext | null;
    title?: string;
}

// DRAFT: 待主干评审
export interface ReforgedChatSendInput {
    content: string;
    sessionId?: string;
    character?: ReforgedChatCharacterContext | null;
    generation?: ReforgedChatGenerationOptions;
    adapter?: HeadlessEngineAdapter;
}

// DRAFT: 待主干评审
export interface ReforgedChatPendingRequest {
    id: string;
    sessionId: string;
    userMessageId: string;
    assistantMessageId: string;
    startedAt: string;
    canAbort: boolean;
}

// DRAFT: 待主干评审
export interface ReforgedChatGenerationState {
    status: ReforgedChatGenerationStatus;
    sessionId: string | null;
    userMessageId: string | null;
    assistantMessageId: string | null;
    pendingRequest: ReforgedChatPendingRequest | null;
    startedAt: string | null;
    finishedAt: string | null;
    error: ReforgedChatError | null;
}

// DRAFT: 待主干评审
export interface ReforgedChatReadiness {
    canSend: boolean;
    hasAdapter: boolean;
    isGenerating: boolean;
    reason: ReforgedChatError | null;
}

// DRAFT: 待主干评审
export interface ReforgedChatSendSuccess {
    ok: true;
    session: ReforgedChatSession;
    userMessage: ReforgedChatMessage;
    assistantMessage: ReforgedChatMessage;
}

// DRAFT: 待主干评审
export interface ReforgedChatSendFailure {
    ok: false;
    error: ReforgedChatError;
    session: ReforgedChatSession | null;
    userMessage: ReforgedChatMessage | null;
    assistantMessage: ReforgedChatMessage | null;
}

// DRAFT: 待主干评审
export type ReforgedChatSendResult = ReforgedChatSendSuccess | ReforgedChatSendFailure;

// DRAFT: 待主干评审
export type ReforgedChatEngineMessage = ReforgedChatCompletionMessage;

// DRAFT: 待主干评审
export type ReforgedChatRuntimeSource = 'stream' | 'non-stream' | 'text';

// DRAFT: 待主干评审
export type ReforgedChatRuntimeEventType = 'snapshot' | 'complete';

// DRAFT: 待主干评审
export interface ReforgedChatRuntimeSnapshot {
    text: string;
    alternatives: string[];
    reasoning: string;
    reasoningSignature: string | null;
    images: string[];
    toolCalls: ReforgedChatRuntimeToolCall[];
    toolSignatures: Record<string, string>;
    logprobs: unknown;
    finishReason: string | null;
    source: ReforgedChatRuntimeSource;
    chunkCount: number;
}

// DRAFT: 待主干评审
export interface ReforgedChatRuntimeToolCall {
    id?: string;
    type?: string;
    name?: string;
    argumentsText?: string;
    argumentsJson?: unknown;
    signature?: string | null;
}

// DRAFT: 待主干评审
export interface ReforgedChatRuntimeResult extends ReforgedChatRuntimeSnapshot {
    completed: true;
}

// DRAFT: 待主干评审
export type ReforgedChatRuntimeEvent =
    | {
        type: 'snapshot';
        snapshot: ReforgedChatRuntimeSnapshot;
    }
    | {
        type: 'complete';
        result: ReforgedChatRuntimeResult;
    };

// DRAFT: 待主干评审
export interface ReforgedChatRuntimeRequestInput {
    session: ReforgedChatSession;
    messages: ReforgedChatMessage[];
    generation?: ReforgedChatGenerationOptions;
    type?: HeadlessChatCompletionRequest['type'];
    signal?: AbortSignal;
}
