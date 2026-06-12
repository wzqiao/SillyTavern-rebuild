import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
    HeadlessChatCompletionRequest,
    HeadlessEngineAdapter,
    HeadlessGenerationRequest,
} from '@/contracts/engine';
import type { ReforgedChatCharacterContext, ReforgedChatLorebookContext } from '@/contracts/chat';
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

    it('adds per-send lorebook context to the generation prompt without storing it as chat history', async () => {
        const generateText = vi.fn(async (_request: HeadlessGenerationRequest): Promise<string> => 'The ship follows the quiet route.');
        const store = useChatStore();
        store.setEngineAdapter(createFakeAdapter(generateText));

        await expect(store.sendUserMessage({
            content: 'Plot a safe course.',
            character: astra,
            lorebooks: [createLorebook('Astra Route Notes', 'A safe course means three burns, then coast dark.')],
        }, sequenceClock([
            '2026-06-09T00:00:00.000Z',
            '2026-06-09T00:00:01.000Z',
            '2026-06-09T00:00:02.000Z',
        ]))).resolves.toMatchObject({ ok: true });

        expect(generateText).toHaveBeenCalledWith(expect.objectContaining({
            prompt: [
                expect.objectContaining({
                    role: 'system',
                    content: expect.stringContaining('A safe course means three burns, then coast dark.'),
                }),
                expect.objectContaining({
                    role: 'assistant',
                    content: 'Coordinates locked. Your move, captain.',
                }),
                expect.objectContaining({
                    role: 'user',
                    content: 'Plot a safe course.',
                }),
            ],
        }));
        expect(store.selectedMessages.map((message) => [message.role, message.content])).toEqual([
            ['assistant', 'Coordinates locked. Your move, captain.'],
            ['user', 'Plot a safe course.'],
            ['assistant', 'The ship follows the quiet route.'],
        ]);
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

    it('sends through the chat-completion runtime and stores normalized alternatives', async () => {
        const generateText = vi.fn(async (): Promise<string> => {
            throw new Error('generateText should not be called for chat-completion runtime');
        });
        const sendChatCompletion = vi.fn(async (_request: HeadlessChatCompletionRequest): Promise<unknown> => ({
            choices: [
                { message: { content: 'Runtime primary reply.' } },
                { message: { content: 'Runtime swipe one.' } },
            ],
        }));
        const store = useChatStore();
        store.setEngineAdapter(createFakeAdapter(generateText, sendChatCompletion));

        const result = await store.sendUserMessage({
            content: 'Use runtime.',
            character: astra,
            lorebooks: [createLorebook('Runtime Routes', 'Runtime lore should reach chat completion.')],
            runtime: {
                mode: 'chat-completion',
                chatCompletionType: 'normal',
            },
        }, sequenceClock([
            '2026-06-09T00:00:00.000Z',
            '2026-06-09T00:00:01.000Z',
            '2026-06-09T00:00:02.000Z',
        ]));

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }

        expect(generateText).not.toHaveBeenCalled();
        expect(sendChatCompletion).toHaveBeenCalledWith({
            messages: [
                expect.objectContaining({
                    role: 'system',
                    content: expect.stringContaining('Runtime lore should reach chat completion.'),
                }),
                {
                    role: 'assistant',
                    content: 'Coordinates locked. Your move, captain.',
                },
                {
                    role: 'user',
                    content: 'Use runtime.',
                },
            ],
            type: 'normal',
            signal: expect.any(AbortSignal),
            jsonSchema: null,
            responseLength: null,
            runtimeConnection: null,
            sampling: null,
        });
        expect(result.assistantMessage).toMatchObject({
            content: 'Runtime primary reply.',
            activeAlternativeIndex: 0,
            alternatives: [
                expect.objectContaining({ content: 'Runtime primary reply.' }),
                expect.objectContaining({ content: 'Runtime swipe one.' }),
            ],
        });
        expect(store.pendingAbortController).toBeNull();
    });

    it('materializes memory-only runtime connections inside chat-completion requests', async () => {
        const runtimeConnection = {
            provider: 'openai-compatible' as const,
            baseUrl: 'https://api.example.test/v1',
            model: 'example-chat-model',
            apiKey: 'memory-only-secret',
            api: 'openai' as const,
        };
        const sendChatCompletion = vi.fn(async (): Promise<unknown> => ({
            choices: [{ message: { content: 'Connected runtime reply.' } }],
        }));
        const store = useChatStore();
        store.setEngineAdapter(createFakeAdapter(vi.fn(async () => 'unused'), sendChatCompletion));

        const result = await store.sendUserMessage({
            content: 'Use direct backend.',
            runtime: {
                mode: 'chat-completion',
            },
            runtimeConnectionProvider: () => runtimeConnection,
            generation: {
                responseLength: 96,
            },
        });

        expect(result.ok).toBe(true);
        expect(sendChatCompletion).toHaveBeenCalledWith(expect.objectContaining({
            responseLength: 96,
            runtimeConnection,
        }));
        expect(JSON.stringify(store.messages)).not.toContain(runtimeConnection.apiKey);
        expect(JSON.stringify(store.generation)).not.toContain(runtimeConnection.apiKey);
        expect(JSON.stringify({
            content: 'Use direct backend.',
            runtime: { mode: 'chat-completion' },
            runtimeConnectionProvider: '[function]',
            generation: { responseLength: 96 },
        })).not.toContain(runtimeConnection.apiKey);
    });

    it('fails chat-completion runtime when the connection provider cannot materialize a secret', async () => {
        const sendChatCompletion = vi.fn(async (): Promise<unknown> => ({
            choices: [{ message: { content: 'should not be called' } }],
        }));
        const store = useChatStore();
        store.setEngineAdapter(createFakeAdapter(vi.fn(async () => 'unused'), sendChatCompletion));

        const result = await store.sendUserMessage({
            content: 'Use missing runtime secret.',
            runtime: {
                mode: 'chat-completion',
            },
            runtimeConnectionProvider: () => null,
        }, sequenceClock([
            '2026-06-09T00:00:00.000Z',
            '2026-06-09T00:00:01.000Z',
            '2026-06-09T00:00:02.000Z',
        ]));

        expect(result).toMatchObject({
            ok: false,
            error: {
                code: 'runtime-connection-unavailable',
                message: 'Runtime API key is no longer available in memory.',
            },
            assistantMessage: {
                status: 'failed',
                error: {
                    code: 'runtime-connection-unavailable',
                },
            },
        });
        expect(sendChatCompletion).not.toHaveBeenCalled();
    });

    it('streams chat-completion snapshots into the assistant message before completion', async () => {
        const firstChunkObserved = deferred<void>();
        const releaseFinalChunk = deferred<void>();
        async function* streamData() {
            yield {
                text: 'Runtime part',
                swipes: ['Alt part'],
            };
            firstChunkObserved.resolve(undefined);
            await releaseFinalChunk.promise;
            yield {
                text: 'Runtime final reply.',
                swipes: ['Runtime final swipe.'],
            };
        }

        const sendChatCompletion = vi.fn(async (): Promise<unknown> => streamData());
        const store = useChatStore();
        store.setEngineAdapter(createFakeAdapter(
            vi.fn(async () => {
                throw new Error('generateText should not be called for chat-completion runtime');
            }),
            sendChatCompletion,
        ));

        const sendPromise = store.sendUserMessage({
            content: 'Stream runtime.',
            character: astra,
            runtime: {
                mode: 'chat-completion',
                chatCompletionType: 'normal',
            },
        }, sequenceClock([
            '2026-06-09T00:00:00.000Z',
            '2026-06-09T00:00:01.000Z',
            '2026-06-09T00:00:02.000Z',
        ]));

        await firstChunkObserved.promise;

        const streamingAssistant = store.selectedMessages.at(-1);
        expect(streamingAssistant).toMatchObject({
            role: 'assistant',
            content: 'Runtime part',
            status: 'generating',
            alternatives: [],
            activeAlternativeIndex: -1,
        });
        expect(store.generation.status).toBe('generating');

        releaseFinalChunk.resolve(undefined);

        await expect(sendPromise).resolves.toMatchObject({
            ok: true,
            assistantMessage: {
                content: 'Runtime final reply.',
                status: 'sent',
                activeAlternativeIndex: 0,
                alternatives: [
                    expect.objectContaining({ content: 'Runtime final reply.' }),
                    expect.objectContaining({ content: 'Runtime final swipe.' }),
                ],
            },
        });
        expect(store.generation.status).toBe('idle');
        expect(store.pendingAbortController).toBeNull();
    });

    it('keeps a cancelled streaming runtime message failed when late chunks arrive', async () => {
        const firstChunkObserved = deferred<void>();
        const releaseLateChunk = deferred<void>();
        async function* streamData() {
            yield { text: 'Partial before cancel.' };
            firstChunkObserved.resolve(undefined);
            await releaseLateChunk.promise;
            yield { text: 'Late text that must not overwrite cancellation.' };
        }

        const store = useChatStore();
        store.setEngineAdapter(createFakeAdapter(vi.fn(async () => 'unused'), vi.fn(async () => streamData())));

        const sendPromise = store.sendUserMessage({
            content: 'Cancel runtime stream.',
            runtime: {
                mode: 'chat-completion',
            },
        }, sequenceClock([
            '2026-06-09T00:00:00.000Z',
            '2026-06-09T00:00:01.000Z',
            '2026-06-09T00:00:02.000Z',
        ]));

        await firstChunkObserved.promise;
        expect(store.selectedMessages.at(-1)).toMatchObject({
            role: 'assistant',
            content: 'Partial before cancel.',
            status: 'generating',
        });

        expect(store.cancelGeneration('2026-06-09T00:00:03.000Z')).toBe(true);
        releaseLateChunk.resolve(undefined);

        await expect(sendPromise).resolves.toMatchObject({
            ok: false,
            error: { code: 'generation-cancelled' },
        });
        expect(store.selectedMessages.at(-1)).toMatchObject({
            role: 'assistant',
            content: 'Partial before cancel.',
            status: 'failed',
            error: { code: 'generation-cancelled' },
        });
        expect(store.generation.status).toBe('cancelled');
        expect(store.pendingAbortController).toBeNull();
    });

    it('keeps partial streamed content when the runtime stream fails', async () => {
        async function* brokenStream() {
            yield { text: 'Partial before failure.' };
            throw new Error('stream exploded');
        }

        const store = useChatStore();
        store.setEngineAdapter(createFakeAdapter(vi.fn(async () => 'unused'), vi.fn(async () => brokenStream())));

        const result = await store.sendUserMessage({
            content: 'Break runtime stream.',
            runtime: {
                mode: 'chat-completion',
            },
        }, sequenceClock([
            '2026-06-09T00:00:00.000Z',
            '2026-06-09T00:00:01.000Z',
            '2026-06-09T00:00:02.000Z',
        ]));

        expect(result).toMatchObject({
            ok: false,
            error: {
                code: 'generation-failed',
                detail: 'Chat completion stream failed: stream exploded',
            },
            assistantMessage: {
                content: 'Partial before failure.',
                status: 'failed',
            },
        });
    });

    it('uses the first non-empty runtime alternative when the primary reply is empty', async () => {
        const sendChatCompletion = vi.fn(async (): Promise<unknown> => ({
            choices: [
                { message: { content: '   ' } },
                { message: { content: '' } },
                { message: { content: 'Runtime fallback swipe.' } },
            ],
        }));
        const store = useChatStore();
        store.setEngineAdapter(createFakeAdapter(vi.fn(async () => 'unused'), sendChatCompletion));

        const result = await store.sendUserMessage({
            content: 'Need fallback.',
            runtime: {
                mode: 'chat-completion',
            },
        });

        expect(result).toMatchObject({
            ok: true,
            assistantMessage: {
                content: 'Runtime fallback swipe.',
                activeAlternativeIndex: 0,
                alternatives: [
                    expect.objectContaining({ content: 'Runtime fallback swipe.' }),
                ],
            },
        });
    });

    it('leaves the active alternative unset when runtime returns no text', async () => {
        const sendChatCompletion = vi.fn(async (): Promise<unknown> => ({
            choices: [
                { message: { content: '   ' } },
                { message: { content: '' } },
            ],
        }));
        const store = useChatStore();
        store.setEngineAdapter(createFakeAdapter(vi.fn(async () => 'unused'), sendChatCompletion));

        const result = await store.sendUserMessage({
            content: 'Empty runtime.',
            runtime: {
                mode: 'chat-completion',
            },
        });

        expect(result).toMatchObject({
            ok: true,
            assistantMessage: {
                content: '',
                activeAlternativeIndex: -1,
                alternatives: [],
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

    it('aborts a pending chat-completion runtime request when cancelled', async () => {
        let capturedSignal: AbortSignal | undefined;
        const sendChatCompletion = vi.fn((request: HeadlessChatCompletionRequest): Promise<unknown> => {
            capturedSignal = request.signal;
            return new Promise((_resolve, reject) => {
                request.signal?.addEventListener('abort', () => {
                    reject(new Error('aborted by test'));
                });
            });
        });
        const store = useChatStore();
        store.setEngineAdapter(createFakeAdapter(vi.fn(async () => 'unused'), sendChatCompletion));

        const firstSend = store.sendUserMessage({
            content: 'Abort runtime.',
            runtime: {
                mode: 'chat-completion',
            },
        }, sequenceClock([
            '2026-06-09T00:00:00.000Z',
            '2026-06-09T00:00:01.000Z',
            '2026-06-09T00:00:02.000Z',
        ]));

        expect(store.generation).toMatchObject({
            status: 'generating',
            pendingRequest: {
                canAbort: true,
            },
        });
        expect(capturedSignal?.aborted).toBe(false);

        expect(store.cancelGeneration('2026-06-09T00:00:03.000Z')).toBe(true);
        expect(capturedSignal?.aborted).toBe(true);

        await expect(firstSend).resolves.toMatchObject({
            ok: false,
            error: { code: 'generation-cancelled' },
        });
        expect(store.pendingAbortController).toBeNull();
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

    it('regenerates an assistant message as a new active swipe without adding a user message', async () => {
        const generateText = vi
            .fn(async () => 'First version')
            .mockResolvedValueOnce('First version')
            .mockResolvedValueOnce('Regenerated version');
        const store = useChatStore();
        store.setEngineAdapter(createFakeAdapter(generateText));

        const result = await store.sendUserMessage({
            content: 'Draft a reply',
        }, sequenceClock([
            '2026-06-09T00:00:00.000Z',
            '2026-06-09T00:00:01.000Z',
            '2026-06-09T00:00:02.000Z',
        ]));

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }

        await expect(store.regenerateAssistantMessage(result.assistantMessage.id, {}, sequenceClock([
            '2026-06-09T00:00:03.000Z',
            '2026-06-09T00:00:04.000Z',
        ]))).resolves.toMatchObject({
            ok: true,
            assistantMessage: {
                content: 'Regenerated version',
                activeAlternativeIndex: 1,
                alternatives: [
                    expect.objectContaining({ content: 'First version' }),
                    expect.objectContaining({ content: 'Regenerated version' }),
                ],
            },
        });

        expect(store.selectedMessages.map((message) => [message.role, message.content])).toEqual([
            ['user', 'Draft a reply'],
            ['assistant', 'Regenerated version'],
        ]);
        expect(generateText).toHaveBeenLastCalledWith(expect.objectContaining({
            prompt: [
                {
                    role: 'user',
                    content: 'Draft a reply',
                },
            ],
        }));
        expect(store.generation.status).toBe('idle');
    });

    it('continues an assistant message by including the current assistant content in context', async () => {
        const generateText = vi
            .fn(async () => 'First version')
            .mockResolvedValueOnce('First version')
            .mockResolvedValueOnce('More detail.');
        const store = useChatStore();
        store.setEngineAdapter(createFakeAdapter(generateText));

        const result = await store.sendUserMessage({
            content: 'Draft a reply',
        }, sequenceClock([
            '2026-06-09T00:00:00.000Z',
            '2026-06-09T00:00:01.000Z',
            '2026-06-09T00:00:02.000Z',
        ]));

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }

        await expect(store.continueAssistantMessage(result.assistantMessage.id, {}, sequenceClock([
            '2026-06-09T00:00:03.000Z',
            '2026-06-09T00:00:04.000Z',
        ]))).resolves.toMatchObject({
            ok: true,
            assistantMessage: {
                content: 'First version\n\nMore detail.',
                activeAlternativeIndex: 0,
                alternatives: [
                    expect.objectContaining({ content: 'First version\n\nMore detail.' }),
                ],
            },
        });

        expect(generateText).toHaveBeenLastCalledWith(expect.objectContaining({
            prompt: [
                {
                    role: 'user',
                    content: 'Draft a reply',
                },
                {
                    role: 'assistant',
                    content: 'First version',
                },
            ],
        }));
    });

    it('retries a failed assistant message in place and clears the failed state', async () => {
        const generateText = vi.fn(async (_request: HeadlessGenerationRequest): Promise<string> => 'Recovered reply');
        generateText.mockRejectedValueOnce(new Error('provider offline'));
        const store = useChatStore();
        store.setEngineAdapter(createFakeAdapter(generateText));

        const failedResult = await store.sendUserMessage({
            content: 'Anyone there?',
        }, sequenceClock([
            '2026-06-09T00:00:00.000Z',
            '2026-06-09T00:00:01.000Z',
            '2026-06-09T00:00:02.000Z',
        ]));

        expect(failedResult.ok).toBe(false);
        if (failedResult.ok || !failedResult.assistantMessage) {
            return;
        }

        await expect(store.retryFailedAssistantMessage(failedResult.assistantMessage.id, {}, sequenceClock([
            '2026-06-09T00:00:03.000Z',
            '2026-06-09T00:00:04.000Z',
        ]))).resolves.toMatchObject({
            ok: true,
            assistantMessage: {
                content: 'Recovered reply',
                status: 'sent',
                error: undefined,
                activeAlternativeIndex: 0,
            },
        });

        expect(store.selectedMessages.map((message) => [message.role, message.content, message.status])).toEqual([
            ['user', 'Anyone there?', 'sent'],
            ['assistant', 'Recovered reply', 'sent'],
        ]);
        expect(generateText).toHaveBeenLastCalledWith(expect.objectContaining({
            prompt: [
                {
                    role: 'user',
                    content: 'Anyone there?',
                },
            ],
        }));
    });

    it('prevents assistant actions while another generation is active', async () => {
        const pending = deferred<string>();
        const store = useChatStore();
        const greetingSession = store.startSession({ character: astra }, '2026-06-09T00:00:00.000Z');
        const greetingMessageId = greetingSession.messageIds[0];
        store.setEngineAdapter(createFakeAdapter(vi.fn((_request: HeadlessGenerationRequest) => pending.promise)));

        const sendPromise = store.sendUserMessage({ content: 'Hold position.' }, sequenceClock([
            '2026-06-09T00:00:01.000Z',
            '2026-06-09T00:00:02.000Z',
            '2026-06-09T00:00:03.000Z',
        ]));

        await expect(store.regenerateAssistantMessage(greetingMessageId)).resolves.toMatchObject({
            ok: false,
            error: {
                code: 'generation-in-progress',
            },
        });

        pending.resolve('Holding.');
        await expect(sendPromise).resolves.toMatchObject({
            ok: true,
            assistantMessage: {
                content: 'Holding.',
            },
        });
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

function createFakeAdapter(
    generateText: (request: HeadlessGenerationRequest) => Promise<string>,
    sendChatCompletion: (request: HeadlessChatCompletionRequest) => Promise<unknown> = vi.fn(async () => ({})),
): HeadlessEngineAdapter {
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
        sendChatCompletion,
    };
}

function createLorebook(name: string, content: string): ReforgedChatLorebookContext {
    return {
        id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name,
        entries: [
            {
                id: 'entry-1',
                title: 'Route note',
                content,
            },
        ],
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

describe('importLegacySession', () => {
    it('rebuilds a session with original timestamps and swipe alternatives', () => {
        const store = useChatStore();

        const session = store.importLegacySession({
            userName: null,
            characterName: 'Seraphina',
            warnings: [],
            messages: [
                { role: 'assistant', content: '开场白', createdAt: '2026-06-11T15:50:00.000Z', alternatives: ['开场白'], activeAlternativeIndex: 0 },
                { role: 'user', content: '你好', createdAt: '2026-06-11T15:51:00.000Z', alternatives: [], activeAlternativeIndex: -1 },
                { role: 'assistant', content: '第二版', createdAt: '2026-06-11T15:52:00.000Z', alternatives: ['第一版', '第二版'], activeAlternativeIndex: 1 },
            ],
        });

        expect(session.title).toBe('Seraphina');
        expect(session.createdAt).toBe('2026-06-11T15:50:00.000Z');
        expect(session.updatedAt).toBe('2026-06-11T15:52:00.000Z');
        expect(store.selectedSessionId).toBe(session.id);

        const messages = store.selectedMessages;
        expect(messages).toHaveLength(3);
        expect(messages[0].authorId).toBe('local-character');
        expect(messages[1].authorId).toBe('local-user');
        expect(messages[2].alternatives.map((alternative) => alternative.content)).toEqual(['第一版', '第二版']);
        expect(messages[2].activeAlternativeIndex).toBe(1);
        expect(messages[2].content).toBe('第二版');
    });
});
