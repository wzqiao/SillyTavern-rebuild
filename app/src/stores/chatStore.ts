import { defineStore } from 'pinia';
import { markRaw } from 'vue';
import type { HeadlessEngineAdapter } from '@/contracts/engine';
import type {
    ReforgedChatError,
    ReforgedChatGenerationState,
    ReforgedChatMessage,
    ReforgedChatMessageAlternative,
    ReforgedChatPendingRequest,
    ReforgedChatReadiness,
    ReforgedChatSendFailure,
    ReforgedChatSendInput,
    ReforgedChatSendResult,
    ReforgedChatSession,
    ReforgedChatStartSessionInput,
} from '@/contracts/chat';
import {
    createChatGenerationRequest,
    readReforgedSessionMessages,
    sendChatRuntimeCompletion,
} from '@/services';

type Clock = () => string;

interface ChatStoreState {
    sessions: ReforgedChatSession[];
    messages: ReforgedChatMessage[];
    selectedSessionId: string | null;
    generation: ReforgedChatGenerationState;
    lastSendResult: ReforgedChatSendResult | null;
    engineAdapter: HeadlessEngineAdapter | null;
    pendingAbortController: AbortController | null;
    nextSessionLocalId: number;
    nextMessageLocalId: number;
    nextAlternativeLocalId: number;
    nextGenerationLocalId: number;
}

const idleGenerationState = (): ReforgedChatGenerationState => ({
    status: 'idle',
    sessionId: null,
    userMessageId: null,
    assistantMessageId: null,
    pendingRequest: null,
    startedAt: null,
    finishedAt: null,
    error: null,
});

export const useChatStore = defineStore('chat', {
    state: (): ChatStoreState => ({
        sessions: [],
        messages: [],
        selectedSessionId: null,
        generation: idleGenerationState(),
        lastSendResult: null,
        engineAdapter: null,
        pendingAbortController: null,
        nextSessionLocalId: 1,
        nextMessageLocalId: 1,
        nextAlternativeLocalId: 1,
        nextGenerationLocalId: 1,
    }),

    getters: {
        selectedSession(state): ReforgedChatSession | null {
            return state.sessions.find((session) => session.id === state.selectedSessionId) ?? null;
        },

        selectedMessages(state): ReforgedChatMessage[] {
            const session = state.sessions.find((item) => item.id === state.selectedSessionId);
            return session ? readReforgedSessionMessages(session, state.messages) : [];
        },

        isGenerating(state): boolean {
            return state.generation.status === 'generating';
        },

        readiness(state): ReforgedChatReadiness {
            if (state.generation.status === 'generating') {
                return {
                    canSend: false,
                    hasAdapter: Boolean(state.engineAdapter),
                    isGenerating: true,
                    reason: createChatError('generation-in-progress', 'A generation is already in progress.'),
                };
            }

            if (!state.engineAdapter) {
                return {
                    canSend: false,
                    hasAdapter: false,
                    isGenerating: false,
                    reason: createChatError('adapter-not-configured', 'Configure a headless engine adapter before sending chat messages.'),
                };
            }

            return {
                canSend: true,
                hasAdapter: true,
                isGenerating: false,
                reason: null,
            };
        },
    },

    actions: {
        setEngineAdapter(adapter: HeadlessEngineAdapter | null): void {
            this.engineAdapter = adapter ? markRaw(adapter) : null;
        },

        startSession(input: ReforgedChatStartSessionInput = {}, createdAt = createIsoTimestamp()): ReforgedChatSession {
            const character = input.character ?? null;
            const session: ReforgedChatSession = {
                id: `chat-session-${this.nextSessionLocalId}`,
                character,
                title: input.title?.trim() || character?.name || 'New chat',
                createdAt,
                updatedAt: createdAt,
                messageIds: [],
            };

            this.nextSessionLocalId += 1;
            this.sessions.push(session);
            this.selectedSessionId = session.id;

            const firstMessage = character?.firstMessage?.trim();
            if (firstMessage) {
                const greeting = this.createMessage(session.id, 'assistant', firstMessage, createdAt, 'sent');
                greeting.alternatives = [this.createAlternative(firstMessage, createdAt)];
                greeting.activeAlternativeIndex = 0;
                session.messageIds.push(greeting.id);
                this.messages.push(greeting);
            }

            return session;
        },

        selectSession(sessionId: string): boolean {
            if (!this.sessions.some((session) => session.id === sessionId)) {
                return false;
            }

            this.selectedSessionId = sessionId;
            return true;
        },

        async sendUserMessage(input: ReforgedChatSendInput, clock: Clock = createIsoTimestamp): Promise<ReforgedChatSendResult> {
            const content = input.content.trim();

            if (!content) {
                return this.recordSendFailure(createChatError('empty-message', 'Message content is required.'), null, null, null);
            }

            if (this.isGenerating) {
                return this.recordSendFailure(
                    createChatError('generation-in-progress', 'A generation is already in progress.'),
                    this.selectedSession,
                    null,
                    null,
                );
            }

            const adapter = input.adapter ?? this.engineAdapter;
            if (!adapter) {
                return this.recordSendFailure(
                    createChatError('adapter-not-configured', 'Configure a headless engine adapter before sending chat messages.'),
                    null,
                    null,
                    null,
                );
            }

            const startedAt = clock();
            const session = this.resolveSessionForSend(input, startedAt);
            if (!session) {
                return this.recordSendFailure(
                    createChatError('session-not-found', `Chat session "${input.sessionId}" was not found.`),
                    null,
                    null,
                    null,
                );
            }

            const userMessage = this.createMessage(session.id, 'user', content, startedAt, 'sent');
            session.messageIds.push(userMessage.id);
            session.updatedAt = startedAt;
            this.messages.push(userMessage);

            const request = createChatGenerationRequest({
                session,
                messages: this.messages,
                generation: input.generation,
            });
            const assistantCreatedAt = clock();
            const assistantMessage = this.createMessage(session.id, 'assistant', '', assistantCreatedAt, 'generating');
            session.messageIds.push(assistantMessage.id);
            this.messages.push(assistantMessage);
            const isChatCompletionRuntime = input.runtime?.mode === 'chat-completion';
            const abortController = isChatCompletionRuntime ? new AbortController() : null;
            this.pendingAbortController = abortController ? markRaw(abortController) : null;
            const pendingRequest = this.createPendingRequest(
                session.id,
                userMessage.id,
                assistantMessage.id,
                startedAt,
                Boolean(abortController),
            );
            this.generation = {
                status: 'generating',
                sessionId: session.id,
                userMessageId: userMessage.id,
                assistantMessageId: assistantMessage.id,
                pendingRequest,
                startedAt,
                finishedAt: null,
                error: null,
            };

            try {
                const runtimeResult = isChatCompletionRuntime
                    ? await sendChatRuntimeCompletion(adapter, {
                        session,
                        messages: this.messages,
                        generation: input.generation,
                        type: input.runtime?.chatCompletionType,
                        signal: abortController?.signal,
                    })
                    : null;
                const reply = runtimeResult?.text ?? await adapter.generateText(request);
                if (!this.isActivePendingRequest(pendingRequest.id)) {
                    return createSendFailureResult(
                        createChatError('generation-cancelled', 'Generation was cancelled before completion.'),
                        session,
                        userMessage,
                        assistantMessage,
                    );
                }

                const finishedAt = clock();
                const normalizedReply = reply.trim();
                assistantMessage.content = normalizedReply;
                assistantMessage.status = 'sent';
                assistantMessage.updatedAt = finishedAt;
                assistantMessage.alternatives = [
                    this.createAlternative(normalizedReply, finishedAt),
                    ...(runtimeResult?.alternatives ?? []).map((alternative) => this.createAlternative(alternative.trim(), finishedAt)),
                ].filter((alternative) => alternative.content.length > 0);
                assistantMessage.activeAlternativeIndex = 0;
                session.updatedAt = finishedAt;
                this.pendingAbortController = null;
                this.generation = idleGenerationState();

                const result: ReforgedChatSendResult = {
                    ok: true,
                    session,
                    userMessage,
                    assistantMessage,
                };
                this.lastSendResult = result;
                return result;
            } catch (error) {
                if (!this.isActivePendingRequest(pendingRequest.id)) {
                    return createSendFailureResult(
                        createChatError('generation-cancelled', 'Generation was cancelled before completion.'),
                        session,
                        userMessage,
                        assistantMessage,
                    );
                }

                const finishedAt = clock();
                const chatError = createChatError('generation-failed', 'The headless engine failed to generate a reply.', describeError(error));
                assistantMessage.status = 'failed';
                assistantMessage.error = chatError;
                assistantMessage.updatedAt = finishedAt;
                session.updatedAt = finishedAt;
                this.pendingAbortController = null;
                this.generation = {
                    status: 'failed',
                    sessionId: session.id,
                    userMessageId: userMessage.id,
                    assistantMessageId: assistantMessage.id,
                    pendingRequest: null,
                    startedAt,
                    finishedAt,
                    error: chatError,
                };

                return this.recordSendFailure(chatError, session, userMessage, assistantMessage);
            }
        },

        editMessage(messageId: string, content: string, updatedAt = createIsoTimestamp()): boolean {
            const message = this.messages.find((item) => item.id === messageId);
            const normalizedContent = content.trim();

            if (!message || !normalizedContent) {
                return false;
            }

            message.content = normalizedContent;
            message.updatedAt = updatedAt;
            message.error = undefined;
            message.status = 'sent';

            if (message.role === 'assistant') {
                if (message.activeAlternativeIndex >= 0 && message.alternatives[message.activeAlternativeIndex]) {
                    message.alternatives[message.activeAlternativeIndex] = {
                        ...message.alternatives[message.activeAlternativeIndex],
                        content: normalizedContent,
                    };
                } else {
                    message.alternatives = [this.createAlternative(normalizedContent, updatedAt)];
                    message.activeAlternativeIndex = 0;
                }
            }

            const session = this.sessions.find((item) => item.id === message.sessionId);
            if (session) {
                session.updatedAt = updatedAt;
            }

            return true;
        },

        cancelGeneration(finishedAt = createIsoTimestamp()): boolean {
            const pendingRequest = this.generation.pendingRequest;
            if (this.generation.status !== 'generating' || !pendingRequest) {
                return false;
            }

            const error = createChatError('generation-cancelled', 'Generation was cancelled before completion.');
            const session = this.sessions.find((item) => item.id === pendingRequest.sessionId) ?? null;
            const userMessage = this.messages.find((item) => item.id === pendingRequest.userMessageId) ?? null;
            const assistantMessage = this.messages.find((item) => item.id === pendingRequest.assistantMessageId) ?? null;

            if (pendingRequest.canAbort) {
                this.pendingAbortController?.abort();
            }
            this.pendingAbortController = null;

            if (assistantMessage) {
                assistantMessage.status = 'failed';
                assistantMessage.error = error;
                assistantMessage.updatedAt = finishedAt;
            }

            if (session) {
                session.updatedAt = finishedAt;
            }

            this.generation = {
                status: 'cancelled',
                sessionId: pendingRequest.sessionId,
                userMessageId: pendingRequest.userMessageId,
                assistantMessageId: pendingRequest.assistantMessageId,
                pendingRequest: null,
                startedAt: pendingRequest.startedAt,
                finishedAt,
                error,
            };
            this.lastSendResult = createSendFailureResult(error, session, userMessage, assistantMessage);
            return true;
        },

        deleteMessage(messageId: string): boolean {
            const messageIndex = this.messages.findIndex((message) => message.id === messageId);
            if (messageIndex < 0) {
                return false;
            }

            const [message] = this.messages.splice(messageIndex, 1);
            const session = this.sessions.find((item) => item.id === message.sessionId);
            if (session) {
                session.messageIds = session.messageIds.filter((id) => id !== messageId);
            }

            return true;
        },

        appendAssistantSwipe(messageId: string, content: string, createdAt = createIsoTimestamp()): boolean {
            const message = this.messages.find((item) => item.id === messageId);
            const normalizedContent = content.trim();

            if (!message || message.role !== 'assistant' || !normalizedContent) {
                return false;
            }

            message.alternatives.push(this.createAlternative(normalizedContent, createdAt));
            message.activeAlternativeIndex = message.alternatives.length - 1;
            message.content = normalizedContent;
            message.updatedAt = createdAt;
            message.status = 'sent';
            message.error = undefined;
            return true;
        },

        selectAssistantSwipe(messageId: string, alternativeIndex: number, updatedAt = createIsoTimestamp()): boolean {
            const message = this.messages.find((item) => item.id === messageId);
            const alternative = message?.alternatives[alternativeIndex];

            if (!message || message.role !== 'assistant' || !alternative) {
                return false;
            }

            message.activeAlternativeIndex = alternativeIndex;
            message.content = alternative.content;
            message.updatedAt = updatedAt;
            return true;
        },

        removeSession(sessionId: string): boolean {
            const sessionIndex = this.sessions.findIndex((session) => session.id === sessionId);
            if (sessionIndex < 0) {
                return false;
            }

            this.sessions.splice(sessionIndex, 1);
            this.messages = this.messages.filter((message) => message.sessionId !== sessionId);

            if (this.selectedSessionId === sessionId) {
                this.selectedSessionId = this.sessions.at(sessionIndex - 1)?.id ?? this.sessions[0]?.id ?? null;
            }

            return true;
        },

        clearChat(): void {
            this.sessions = [];
            this.messages = [];
            this.selectedSessionId = null;
            this.generation = idleGenerationState();
            this.lastSendResult = null;
            this.engineAdapter = null;
            this.pendingAbortController = null;
            this.nextSessionLocalId = 1;
            this.nextMessageLocalId = 1;
            this.nextAlternativeLocalId = 1;
            this.nextGenerationLocalId = 1;
        },

        resolveSessionForSend(input: ReforgedChatSendInput, createdAt: string): ReforgedChatSession | null {
            if (input.sessionId) {
                const session = this.sessions.find((item) => item.id === input.sessionId) ?? null;
                if (session && input.character) {
                    session.character = input.character;
                    session.title = session.title || input.character.name;
                }
                return session;
            }

            const selectedSession = this.selectedSession;
            if (selectedSession && (!input.character || selectedSession.character?.id === input.character.id)) {
                return selectedSession;
            }

            return this.startSession({ character: input.character ?? null }, createdAt);
        },

        createMessage(
            sessionId: string,
            role: ReforgedChatMessage['role'],
            content: string,
            createdAt: string,
            status: ReforgedChatMessage['status'],
        ): ReforgedChatMessage {
            const message: ReforgedChatMessage = {
                id: `chat-message-${this.nextMessageLocalId}`,
                sessionId,
                role,
                content,
                createdAt,
                status,
                alternatives: [],
                activeAlternativeIndex: -1,
            };
            this.nextMessageLocalId += 1;
            return message;
        },

        createAlternative(content: string, createdAt: string): ReforgedChatMessageAlternative {
            const alternative: ReforgedChatMessageAlternative = {
                id: `chat-alternative-${this.nextAlternativeLocalId}`,
                content,
                createdAt,
            };
            this.nextAlternativeLocalId += 1;
            return alternative;
        },

        createPendingRequest(
            sessionId: string,
            userMessageId: string,
            assistantMessageId: string,
            startedAt: string,
            canAbort = false,
        ): ReforgedChatPendingRequest {
            const pendingRequest: ReforgedChatPendingRequest = {
                id: `chat-generation-${this.nextGenerationLocalId}`,
                sessionId,
                userMessageId,
                assistantMessageId,
                startedAt,
                canAbort,
            };
            this.nextGenerationLocalId += 1;
            return pendingRequest;
        },

        isActivePendingRequest(pendingRequestId: string): boolean {
            return this.generation.status === 'generating' && this.generation.pendingRequest?.id === pendingRequestId;
        },

        recordSendFailure(
            error: ReforgedChatError,
            session: ReforgedChatSession | null,
            userMessage: ReforgedChatMessage | null,
            assistantMessage: ReforgedChatMessage | null,
        ): ReforgedChatSendFailure {
            const result = createSendFailureResult(error, session, userMessage, assistantMessage);
            this.lastSendResult = result;
            return result;
        },
    },
});

function createChatError(code: ReforgedChatError['code'], message: string, detail?: string): ReforgedChatError {
    return {
        code,
        message,
        detail,
    };
}

function createSendFailureResult(
    error: ReforgedChatError,
    session: ReforgedChatSession | null,
    userMessage: ReforgedChatMessage | null,
    assistantMessage: ReforgedChatMessage | null,
): ReforgedChatSendFailure {
    return {
        ok: false,
        error,
        session,
        userMessage,
        assistantMessage,
    };
}

function createIsoTimestamp(): string {
    return new Date().toISOString();
}

function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
