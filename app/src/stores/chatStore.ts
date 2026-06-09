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
    ReforgedChatRuntimeResult,
    ReforgedChatSendFailure,
    ReforgedChatSendInput,
    ReforgedChatSendResult,
    ReforgedChatSession,
    ReforgedChatStartSessionInput,
} from '@/contracts/chat';
import {
    createChatGenerationRequest,
    readReforgedSessionMessages,
    sendChatRuntimeEvents,
} from '@/services';

type Clock = () => string;
type AssistantActionMode = 'replace' | 'continue';

type ReforgedChatAssistantActionInput = Omit<ReforgedChatSendInput, 'content' | 'sessionId'>;

interface ReforgedChatAssistantActionSuccess {
    ok: true;
    session: ReforgedChatSession;
    userMessage: ReforgedChatMessage | null;
    assistantMessage: ReforgedChatMessage;
}

type ReforgedChatAssistantActionResult = ReforgedChatAssistantActionSuccess | ReforgedChatSendFailure;

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
                lorebooks: input.lorebooks,
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
                let runtimeResult: ReforgedChatRuntimeResult | null = null;

                if (isChatCompletionRuntime) {
                    const runtimeConnection = input.runtimeConnectionProvider?.() ?? null;
                    if (input.runtimeConnectionProvider && !runtimeConnection) {
                        throw createChatError(
                            'runtime-connection-unavailable',
                            'Runtime API key is no longer available in memory.',
                        );
                    }

                    for await (const event of sendChatRuntimeEvents(adapter, {
                        session,
                        messages: this.messages,
                        lorebooks: input.lorebooks,
                        generation: input.generation,
                        type: input.runtime?.chatCompletionType,
                        signal: abortController?.signal,
                        runtimeConnection,
                    })) {
                        if (!this.isActivePendingRequest(pendingRequest.id)) {
                            return createSendFailureResult(
                                createChatError('generation-cancelled', 'Generation was cancelled before completion.'),
                                session,
                                userMessage,
                                assistantMessage,
                            );
                        }

                        if (event.type === 'snapshot') {
                            assistantMessage.content = event.snapshot.text;
                        } else {
                            runtimeResult = event.result;
                        }
                    }
                }

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
                const assistantAlternatives = [
                    reply,
                    ...(runtimeResult?.alternatives ?? []),
                ]
                    .map((alternative) => alternative.trim())
                    .filter((alternative) => alternative.length > 0);
                assistantMessage.content = assistantAlternatives[0] ?? reply.trim();
                assistantMessage.status = 'sent';
                assistantMessage.updatedAt = finishedAt;
                assistantMessage.alternatives = assistantAlternatives.map((alternative) => this.createAlternative(alternative, finishedAt));
                assistantMessage.activeAlternativeIndex = assistantMessage.alternatives.length > 0 ? 0 : -1;
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
                const chatError = isReforgedChatError(error)
                    ? error
                    : createChatError('generation-failed', 'The headless engine failed to generate a reply.', describeError(error));
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

        async regenerateAssistantMessage(
            messageId: string,
            input: ReforgedChatAssistantActionInput = {},
            clock: Clock = createIsoTimestamp,
        ): Promise<ReforgedChatAssistantActionResult> {
            return this.generateAssistantMessageAction(messageId, input, 'replace', clock);
        },

        async continueAssistantMessage(
            messageId: string,
            input: ReforgedChatAssistantActionInput = {},
            clock: Clock = createIsoTimestamp,
        ): Promise<ReforgedChatAssistantActionResult> {
            const assistantMessage = this.messages.find((item) => item.id === messageId);
            if (!assistantMessage?.content.trim()) {
                return this.recordSendFailure(
                    createChatError('empty-message', 'Assistant content is required before continuing.'),
                    assistantMessage ? this.sessions.find((session) => session.id === assistantMessage.sessionId) ?? null : null,
                    null,
                    assistantMessage ?? null,
                );
            }

            return this.generateAssistantMessageAction(messageId, input, 'continue', clock);
        },

        async retryFailedAssistantMessage(
            messageId: string,
            input: ReforgedChatAssistantActionInput = {},
            clock: Clock = createIsoTimestamp,
        ): Promise<ReforgedChatAssistantActionResult> {
            const assistantMessage = this.messages.find((item) => item.id === messageId);
            if (assistantMessage?.status !== 'failed') {
                return this.recordSendFailure(
                    createChatError('generation-failed', 'Only failed assistant messages can be retried.'),
                    assistantMessage ? this.sessions.find((session) => session.id === assistantMessage.sessionId) ?? null : null,
                    null,
                    assistantMessage ?? null,
                );
            }

            return this.generateAssistantMessageAction(messageId, input, 'replace', clock);
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

        deleteMessage(messageId: string, deletedAt = createIsoTimestamp()): boolean {
            const messageIndex = this.messages.findIndex((message) => message.id === messageId);
            if (messageIndex < 0) {
                return false;
            }

            const [message] = this.messages.splice(messageIndex, 1);
            const session = this.sessions.find((item) => item.id === message.sessionId);
            if (session) {
                session.messageIds = session.messageIds.filter((id) => id !== messageId);
                session.updatedAt = deletedAt;
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

        async generateAssistantMessageAction(
            messageId: string,
            input: ReforgedChatAssistantActionInput,
            mode: AssistantActionMode,
            clock: Clock,
        ): Promise<ReforgedChatAssistantActionResult> {
            const assistantMessage = this.messages.find((item) => item.id === messageId);
            const session = assistantMessage
                ? this.sessions.find((item) => item.id === assistantMessage.sessionId) ?? null
                : null;

            if (!assistantMessage || assistantMessage.role !== 'assistant' || !session) {
                return this.recordSendFailure(
                    createChatError('session-not-found', 'Assistant message or session was not found.'),
                    session,
                    null,
                    assistantMessage ?? null,
                );
            }

            if (this.isGenerating) {
                return this.recordSendFailure(
                    createChatError('generation-in-progress', 'A generation is already in progress.'),
                    session,
                    null,
                    assistantMessage,
                );
            }

            const adapter = input.adapter ?? this.engineAdapter;
            if (!adapter) {
                return this.recordSendFailure(
                    createChatError('adapter-not-configured', 'Configure a headless engine adapter before sending chat messages.'),
                    session,
                    null,
                    assistantMessage,
                );
            }

            if (input.character) {
                session.character = input.character;
                session.title = session.title || input.character.name;
            }

            const startedAt = clock();
            const previousStatus = assistantMessage.status;
            const previousContent = assistantMessage.content;
            const userMessage = this.findPreviousUserMessage(session, assistantMessage.id);
            const requestMessages = this.readMessagesThrough(session, assistantMessage.id, mode === 'continue');
            const isChatCompletionRuntime = input.runtime?.mode === 'chat-completion';
            const abortController = isChatCompletionRuntime ? new AbortController() : null;
            this.pendingAbortController = abortController ? markRaw(abortController) : null;
            const pendingRequest = this.createPendingRequest(
                session.id,
                userMessage?.id ?? assistantMessage.id,
                assistantMessage.id,
                startedAt,
                Boolean(abortController),
            );

            assistantMessage.status = 'generating';
            assistantMessage.error = undefined;
            assistantMessage.updatedAt = startedAt;
            session.updatedAt = startedAt;
            this.generation = {
                status: 'generating',
                sessionId: session.id,
                userMessageId: userMessage?.id ?? null,
                assistantMessageId: assistantMessage.id,
                pendingRequest,
                startedAt,
                finishedAt: null,
                error: null,
            };

            try {
                let runtimeResult: ReforgedChatRuntimeResult | null = null;
                const baseContent = previousContent.trim();

                if (isChatCompletionRuntime) {
                    const runtimeConnection = input.runtimeConnectionProvider?.() ?? null;
                    if (input.runtimeConnectionProvider && !runtimeConnection) {
                        throw createChatError(
                            'runtime-connection-unavailable',
                            'Runtime API key is no longer available in memory.',
                        );
                    }

                    for await (const event of sendChatRuntimeEvents(adapter, {
                        session,
                        messages: requestMessages,
                        lorebooks: input.lorebooks,
                        generation: input.generation,
                        type: input.runtime?.chatCompletionType,
                        signal: abortController?.signal,
                        runtimeConnection,
                    })) {
                        if (!this.isActivePendingRequest(pendingRequest.id)) {
                            return createSendFailureResult(
                                createChatError('generation-cancelled', 'Generation was cancelled before completion.'),
                                session,
                                userMessage,
                                assistantMessage,
                            );
                        }

                        if (event.type === 'snapshot') {
                            assistantMessage.content = mode === 'continue'
                                ? appendContinuation(baseContent, event.snapshot.text)
                                : event.snapshot.text;
                        } else {
                            runtimeResult = event.result;
                        }
                    }
                }

                const request = createChatGenerationRequest({
                    session,
                    messages: requestMessages,
                    lorebooks: input.lorebooks,
                    generation: input.generation,
                });
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
                const assistantAlternatives = normalizeAssistantAlternatives(reply, runtimeResult?.alternatives);
                const primaryReply = assistantAlternatives[0] ?? reply.trim();
                if (mode === 'continue') {
                    const continuedContent = appendContinuation(baseContent, primaryReply);
                    assistantMessage.content = continuedContent;
                    this.replaceActiveAssistantAlternative(assistantMessage, continuedContent, finishedAt);

                    for (const alternative of assistantAlternatives.slice(1)) {
                        assistantMessage.alternatives.push(this.createAlternative(appendContinuation(baseContent, alternative), finishedAt));
                    }
                } else {
                    const shouldPreserveExistingSwipes = previousStatus === 'sent' && previousContent.trim().length > 0;
                    if (shouldPreserveExistingSwipes && assistantMessage.alternatives.length === 0) {
                        assistantMessage.alternatives.push(this.createAlternative(previousContent, finishedAt));
                    }

                    if (!shouldPreserveExistingSwipes) {
                        assistantMessage.alternatives = [];
                    }

                    for (const alternative of assistantAlternatives) {
                        assistantMessage.alternatives.push(this.createAlternative(alternative, finishedAt));
                    }

                    assistantMessage.activeAlternativeIndex = assistantAlternatives.length > 0
                        ? assistantMessage.alternatives.length - assistantAlternatives.length
                        : -1;
                    assistantMessage.content = assistantMessage.activeAlternativeIndex >= 0
                        ? assistantMessage.alternatives[assistantMessage.activeAlternativeIndex]?.content ?? primaryReply
                        : primaryReply;
                }

                assistantMessage.status = 'sent';
                assistantMessage.error = undefined;
                assistantMessage.updatedAt = finishedAt;
                session.updatedAt = finishedAt;
                this.pendingAbortController = null;
                this.generation = idleGenerationState();

                const result: ReforgedChatAssistantActionSuccess = {
                    ok: true,
                    session,
                    userMessage,
                    assistantMessage,
                };
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
                const chatError = isReforgedChatError(error)
                    ? error
                    : createChatError('generation-failed', 'The headless engine failed to generate a reply.', describeError(error));
                assistantMessage.status = 'failed';
                assistantMessage.error = chatError;
                assistantMessage.updatedAt = finishedAt;
                session.updatedAt = finishedAt;
                this.pendingAbortController = null;
                this.generation = {
                    status: 'failed',
                    sessionId: session.id,
                    userMessageId: userMessage?.id ?? null,
                    assistantMessageId: assistantMessage.id,
                    pendingRequest: null,
                    startedAt,
                    finishedAt,
                    error: chatError,
                };

                return this.recordSendFailure(chatError, session, userMessage, assistantMessage);
            }
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

        replaceActiveAssistantAlternative(message: ReforgedChatMessage, content: string, updatedAt: string): void {
            if (message.activeAlternativeIndex >= 0 && message.alternatives[message.activeAlternativeIndex]) {
                message.alternatives[message.activeAlternativeIndex] = {
                    ...message.alternatives[message.activeAlternativeIndex],
                    content,
                };
                return;
            }

            message.alternatives = [this.createAlternative(content, updatedAt)];
            message.activeAlternativeIndex = 0;
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

        readMessagesThrough(
            session: ReforgedChatSession,
            messageId: string,
            includeTarget: boolean,
        ): ReforgedChatMessage[] {
            const targetIndex = session.messageIds.indexOf(messageId);
            if (targetIndex < 0) {
                return [];
            }

            const messageIds = includeTarget
                ? session.messageIds.slice(0, targetIndex + 1)
                : session.messageIds.slice(0, targetIndex);

            return messageIds
                .map((id) => this.messages.find((message) => message.id === id))
                .filter((message): message is ReforgedChatMessage => Boolean(message));
        },

        findPreviousUserMessage(session: ReforgedChatSession, messageId: string): ReforgedChatMessage | null {
            const targetIndex = session.messageIds.indexOf(messageId);
            if (targetIndex < 0) {
                return null;
            }

            for (let index = targetIndex - 1; index >= 0; index -= 1) {
                const message = this.messages.find((item) => item.id === session.messageIds[index]);
                if (message?.role === 'user') {
                    return message;
                }
            }

            return null;
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

function normalizeAssistantAlternatives(reply: string, alternatives: string[] = []): string[] {
    return [
        reply,
        ...alternatives,
    ]
        .map((alternative) => alternative.trim())
        .filter((alternative) => alternative.length > 0);
}

function appendContinuation(baseContent: string, continuation: string): string {
    const normalizedBase = baseContent.trim();
    const normalizedContinuation = continuation.trim();

    if (!normalizedBase) {
        return normalizedContinuation;
    }

    if (!normalizedContinuation) {
        return normalizedBase;
    }

    return `${normalizedBase}\n\n${normalizedContinuation}`;
}

function createChatError(code: ReforgedChatError['code'], message: string, detail?: string): ReforgedChatError {
    return {
        code,
        message,
        detail,
    };
}

function isReforgedChatError(error: unknown): error is ReforgedChatError {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        'message' in error &&
        typeof (error as ReforgedChatError).code === 'string' &&
        typeof (error as ReforgedChatError).message === 'string'
    );
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
