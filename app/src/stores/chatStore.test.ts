import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HeadlessEngineAdapter, HeadlessGenerationRequest } from '@/contracts/engine';
import type { ReforgedChatCharacterContext } from '@/contracts/chat';
import { useChatStore } from './chatStore';

const astra: ReforgedChatCharacterContext = {
    id: 'character-astra',
    name: 'Astra',
    description: 'A navigator who reads star maps like sheet music.',
    personality: 'Calm, precise, quietly playful.',
    scenario: 'A damaged survey ship is drifting near a blue giant.',
    firstMessage: 'Coordinates locked. Your move, captain.',
};

describe('useChatStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('starts a character session with the first greeting selected', () => {
        const store = useChatStore();

        const session = store.startSession({ character: astra }, '2026-06-09T00:00:00.000Z');

        expect(session).toMatchObject({
            id: 'chat-session-1',
            character: astra,
            title: 'Astra',
            createdAt: '2026-06-09T00:00:00.000Z',
            updatedAt: '2026-06-09T00:00:00.000Z',
            messageIds: ['chat-message-1'],
        });
        expect(store.selectedSessionId).toBe(session.id);
        expect(store.selectedMessages).toEqual([
            expect.objectContaining({
                id: 'chat-message-1',
                role: 'assistant',
                content: 'Coordinates locked. Your move, captain.',
                alternatives: [
                    {
                        id: 'chat-alternative-1',
                        content: 'Coordinates locked. Your move, captain.',
                        createdAt: '2026-06-09T00:00:00.000Z',
                    },
                ],
                activeAlternativeIndex: 0,
            }),
        ]);
    });

    it('sends a user message through the configured headless adapter', async () => {
        const generateText = vi.fn(async (_request: HeadlessGenerationRequest): Promise<string> => 'The ship answers with a low silver hum.');
        const store = useChatStore();
        store.setEngineAdapter(createFakeAdapter(generateText));
        const clock = sequenceClock([
            '2026-06-09T00:00:00.000Z',
            '2026-06-09T00:00:01.000Z',
            '2026-06-09T00:00:02.000Z',
        ]);

        const result = await store.sendUserMessage({
            content: 'Plot a safe course.',
            character: astra,
            generation: {
                api: 'openai',
                responseLength: 128,
            },
        }, clock);

        expect(result.ok).toBe(true);
        expect(store.sessions).toHaveLength(1);
        expect(store.selectedMessages.map((message) => [message.role, message.content, message.status])).toEqual([
            ['assistant', 'Coordinates locked. Your move, captain.', 'sent'],
            ['user', 'Plot a safe course.', 'sent'],
            ['assistant', 'The ship answers with a low silver hum.', 'sent'],
        ]);
        expect(store.generation.status).toBe('idle');
        expect(store.readiness).toMatchObject({
            canSend: true,
            hasAdapter: true,
            isGenerating: false,
            reason: null,
        });
        expect(generateText).toHaveBeenCalledWith({
            prompt: [
                {
                    role: 'system',
                    content: [
                        'You are roleplaying as Astra. Stay in character and continue the scene naturally.',
                        'Description: A navigator who reads star maps like sheet music.',
                        'Personality: Calm, precise, quietly playful.',
                        'Scenario: A damaged survey ship is drifting near a blue giant.',
                    ].join('\n\n'),
                },
                {
                    role: 'assistant',
                    content: 'Coordinates locked. Your move, captain.',
                },
                {
                    role: 'user',
                    content: 'Plot a safe course.',
                },
            ],
            api: 'openai',
            instructOverride: undefined,
            quietToLoud: undefined,
            responseLength: 128,
            trimNames: true,
            prefill: undefined,
            jsonSchema: null,
        });
        expect(store.lastSendResult).toEqual(result);
    });

    it('records generation failures without dropping the user message', async () => {
        const generateText = vi.fn(async (): Promise<string> => {
            throw new Error('provider offline');
        });
        const store = useChatStore();
        const clock = sequenceClock([
            '2026-06-09T00:00:00.000Z',
            '2026-06-09T00:00:01.000Z',
            '2026-06-09T00:00:02.000Z',
        ]);

        const result = await store.sendUserMessage({
            content: 'Anyone there?',
            adapter: createFakeAdapter(generateText),
        }, clock);

        expect(result).toMatchObject({
            ok: false,
            error: {
                code: 'generation-failed',
                detail: 'provider offline',
            },
            userMessage: {
                role: 'user',
                content: 'Anyone there?',
                status: 'sent',
            },
            assistantMessage: {
                role: 'assistant',
                content: '',
                status: 'failed',
            },
        });
        expect(store.selectedMessages.map((message) => [message.role, message.status])).toEqual([
            ['user', 'sent'],
            ['assistant', 'failed'],
        ]);
        expect(store.generation).toMatchObject({
            status: 'failed',
            error: {
                code: 'generation-failed',
                detail: 'provider offline',
            },
        });
    });

    it('rejects empty messages and missing adapters without mutating chat history', async () => {
        const store = useChatStore();

        await expect(store.sendUserMessage({ content: '   ' })).resolves.toMatchObject({
            ok: false,
            error: { code: 'empty-message' },
        });
        await expect(store.sendUserMessage({ content: 'Hello' })).resolves.toMatchObject({
            ok: false,
            error: { code: 'adapter-not-configured' },
        });

        expect(store.sessions).toEqual([]);
        expect(store.messages).toEqual([]);
    });

    it('prevents overlapping generations', async () => {
        const pending = deferred<string>();
        const generateText = vi.fn((_request: HeadlessGenerationRequest) => pending.promise);
        const store = useChatStore();
        store.setEngineAdapter(createFakeAdapter(generateText));
        const firstSend = store.sendUserMessage({ content: 'First' }, sequenceClock([
            '2026-06-09T00:00:00.000Z',
            '2026-06-09T00:00:01.000Z',
            '2026-06-09T00:00:02.000Z',
        ]));

        await expect(store.sendUserMessage({ content: 'Second' })).resolves.toMatchObject({
            ok: false,
            error: { code: 'generation-in-progress' },
        });

        pending.resolve('First reply');
        await expect(firstSend).resolves.toMatchObject({
            ok: true,
            assistantMessage: {
                content: 'First reply',
            },
        });
        expect(generateText).toHaveBeenCalledOnce();
    });

    it('locally cancels a pending generation and ignores the late adapter reply', async () => {
        const pending = deferred<string>();
        const store = useChatStore();
        store.setEngineAdapter(createFakeAdapter(vi.fn((_request: HeadlessGenerationRequest) => pending.promise)));
        const firstSend = store.sendUserMessage({ content: 'Hold position.' }, sequenceClock([
            '2026-06-09T00:00:00.000Z',
            '2026-06-09T00:00:01.000Z',
            '2026-06-09T00:00:02.000Z',
        ]));

        expect(store.generation).toMatchObject({
            status: 'generating',
            pendingRequest: {
                id: 'chat-generation-1',
                canAbort: false,
            },
        });

        expect(store.cancelGeneration('2026-06-09T00:00:03.000Z')).toBe(true);
        expect(store.generation).toMatchObject({
            status: 'cancelled',
            error: { code: 'generation-cancelled' },
            pendingRequest: null,
        });

        pending.resolve('Late reply that should not overwrite state');
        await expect(firstSend).resolves.toMatchObject({
            ok: false,
            error: { code: 'generation-cancelled' },
        });
        expect(store.selectedMessages.at(-1)).toMatchObject({
            role: 'assistant',
            content: '',
            status: 'failed',
            error: { code: 'generation-cancelled' },
        });
    });

    it('edits, deletes, and switches assistant swipes', async () => {
        const store = useChatStore();
        const result = await store.sendUserMessage({
            content: 'Draft a reply',
            adapter: createFakeAdapter(vi.fn(async () => 'First version')),
        }, sequenceClock([
            '2026-06-09T00:00:00.000Z',
            '2026-06-09T00:00:01.000Z',
            '2026-06-09T00:00:02.000Z',
        ]));

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }

        expect(store.editMessage(result.userMessage.id, 'Draft a warmer reply', '2026-06-09T00:00:03.000Z')).toBe(true);
        expect(result.userMessage.content).toBe('Draft a warmer reply');
        expect(store.appendAssistantSwipe(result.assistantMessage.id, 'Second version', '2026-06-09T00:00:04.000Z')).toBe(true);
        expect(result.assistantMessage.content).toBe('Second version');
        expect(result.assistantMessage.activeAlternativeIndex).toBe(1);
        expect(store.editMessage(result.assistantMessage.id, 'Edited second version', '2026-06-09T00:00:04.500Z')).toBe(true);
        expect(result.assistantMessage.alternatives.map((alternative) => alternative.content)).toEqual([
            'First version',
            'Edited second version',
        ]);
        expect(store.selectAssistantSwipe(result.assistantMessage.id, 0, '2026-06-09T00:00:05.000Z')).toBe(true);
        expect(result.assistantMessage.content).toBe('First version');
        expect(store.deleteMessage(result.userMessage.id)).toBe(true);
        expect(store.selectedMessages.map((message) => message.id)).toEqual([result.assistantMessage.id]);
    });

    it('clears chat state and resets local id counters', () => {
        const store = useChatStore();
        store.startSession({ title: 'Scratch' }, '2026-06-09T00:00:00.000Z');

        store.clearChat();

        expect(store.sessions).toEqual([]);
        expect(store.messages).toEqual([]);
        expect(store.selectedSession).toBeNull();
        expect(store.lastSendResult).toBeNull();

        expect(store.startSession({ title: 'Scratch' }, '2026-06-09T00:00:01.000Z').id).toBe('chat-session-1');
    });
});

function createFakeAdapter(generateText: (request: HeadlessGenerationRequest) => Promise<string>): HeadlessEngineAdapter {
    return {
        inspect: vi.fn(async () => ({
            ok: true,
            checkedAt: '2026-06-09T00:00:00.000Z',
            environment: {
                hasDocument: false,
                hasJQuery: false,
                hasToastr: false,
                hasAbortController: true,
                hasReadableStream: true,
            },
            capabilities: [],
            probes: [],
            warnings: [],
            blockers: [],
        })),
        generateText,
        generateRawData: vi.fn(async () => ({})),
        sendChatCompletion: vi.fn(async () => ({})),
    };
}

function sequenceClock(values: string[]): () => string {
    let index = 0;
    return () => values[index++] ?? values.at(-1) ?? '2026-06-09T00:00:00.000Z';
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
    });

    return { promise, resolve, reject };
}
