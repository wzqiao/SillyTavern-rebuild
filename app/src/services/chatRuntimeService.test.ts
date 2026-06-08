import { describe, expect, it, vi } from 'vitest';
import type { HeadlessChatCompletionRequest, HeadlessEngineAdapter } from '@/contracts/engine';
import type {
    ReforgedChatCharacterContext,
    ReforgedChatMessage,
    ReforgedChatSession,
} from '@/contracts/chat';
import {
    ReforgedChatRuntimeNormalizationError,
    collectChatCompletionResult,
    createChatCompletionRequest,
    normalizeChatCompletionEvents,
    sendChatRuntimeCompletion,
} from './chatRuntimeService';

const astra: ReforgedChatCharacterContext = {
    id: 'character-astra',
    name: 'Astra',
    description: 'A navigator who reads star maps like sheet music.',
};

describe('chatRuntimeService', () => {
    it('creates a headless chat completion request from a Reforged session', () => {
        const abortController = new AbortController();

        expect(createChatCompletionRequest({
            session: createSession(['message-1', 'message-2']),
            messages: [
                createMessage('message-1', 'assistant', 'Coordinates locked.'),
                createMessage('message-2', 'user', 'Plot a safe course.'),
            ],
            type: 'normal',
            signal: abortController.signal,
            generation: {
                systemPrompt: 'Custom system prompt.',
                jsonSchema: { returnInvalid: true },
            },
        })).toEqual({
            messages: [
                {
                    role: 'system',
                    content: 'Custom system prompt.',
                },
                {
                    role: 'assistant',
                    content: 'Coordinates locked.',
                },
                {
                    role: 'user',
                    content: 'Plot a safe course.',
                },
            ],
            type: 'normal',
            signal: abortController.signal,
            jsonSchema: { returnInvalid: true },
        });
    });

    it('normalizes non-stream OpenAI-like responses', async () => {
        await expect(collectChatCompletionResult({
            choices: [
                {
                    message: {
                        content: 'A clean reply.',
                        reasoning: 'Thought trace.',
                        tool_calls: [{ id: 'call-1' }],
                    },
                    logprobs: { content: [] },
                },
            ],
        })).resolves.toEqual({
            completed: true,
            text: 'A clean reply.',
            alternatives: [],
            reasoning: 'Thought trace.',
            reasoningSignature: null,
            images: [],
            toolCalls: [{
                id: 'call-1',
                type: undefined,
                name: undefined,
                argumentsText: undefined,
                argumentsJson: undefined,
                signature: null,
            }],
            toolSignatures: {},
            logprobs: { content: [] },
            finishReason: null,
            source: 'non-stream',
            chunkCount: 1,
        });
    });

    it('normalizes non-stream alternatives, reasoning signatures, and tool-call variants', async () => {
        await expect(collectChatCompletionResult({
            choices: [
                {
                    message: {
                        content: 'Primary.',
                        reasoning_details: [
                            { type: 'reasoning.encrypted', id: 'main', data: 'main-signature' },
                            { type: 'reasoning.encrypted', id: 'call_weather', data: 'tool-signature' },
                        ],
                        tool_calls: [
                            {
                                id: 'call_weather',
                                type: 'function',
                                function: {
                                    name: 'get_weather',
                                    arguments: '{"city":"Shanghai"}',
                                },
                            },
                        ],
                    },
                    finish_reason: 'stop',
                },
                {
                    message: {
                        content: 'Swipe one.',
                    },
                },
                {
                    text: 'Swipe two.',
                },
            ],
            content: [
                {
                    type: 'tool_use',
                    id: 'tool_claude',
                    name: 'search_notes',
                    input: { q: 'stars' },
                },
            ],
            responseContent: {
                parts: [
                    {
                        thought: true,
                        text: 'Gemini thought.',
                        thoughtSignature: 'gemini-signature',
                    },
                    {
                        functionCall: {
                            name: 'lookup_star',
                            args: { id: 42 },
                        },
                    },
                ],
            },
        })).resolves.toEqual({
            completed: true,
            text: 'Primary.',
            alternatives: ['Swipe one.', 'Swipe two.'],
            reasoning: 'Gemini thought.',
            reasoningSignature: 'main-signature',
            images: [],
            toolCalls: [
                {
                    id: 'call_weather',
                    type: 'function',
                    name: 'get_weather',
                    argumentsText: '{"city":"Shanghai"}',
                    argumentsJson: { city: 'Shanghai' },
                    signature: 'tool-signature',
                },
                {
                    id: 'tool_claude',
                    type: 'tool_use',
                    name: 'search_notes',
                    argumentsText: '{"q":"stars"}',
                    argumentsJson: { q: 'stars' },
                    signature: null,
                },
                {
                    id: undefined,
                    type: 'functionCall',
                    name: 'lookup_star',
                    argumentsText: '{"id":42}',
                    argumentsJson: { id: 42 },
                    signature: null,
                },
            ],
            toolSignatures: {
                call_weather: 'tool-signature',
            },
            logprobs: null,
            finishReason: 'stop',
            source: 'non-stream',
            chunkCount: 1,
        });
    });

    it('normalizes content-part arrays and direct text responses', async () => {
        await expect(collectChatCompletionResult({
            choices: [
                {
                    message: {
                        content: [
                            { type: 'text', text: 'Part one ' },
                            { type: 'text', text: 'and two.' },
                            { type: 'image_url', image_url: { url: 'ignored' } },
                        ],
                    },
                },
            ],
        })).resolves.toMatchObject({
            text: 'Part one and two.',
            source: 'non-stream',
        });

        await expect(collectChatCompletionResult('plain reply')).resolves.toMatchObject({
            text: 'plain reply',
            source: 'text',
        });
    });

    it('normalizes SillyTavern streaming generator snapshots and completion', async () => {
        async function* streamData() {
            yield {
                text: 'Hel',
                swipes: ['Alt A'],
                logprobs: null,
                toolCalls: [{ id: 'tool-1' }],
                state: {
                    reasoning: 'r1',
                    images: ['data:image/png;base64,abc'],
                    signature: 'sig-1',
                    toolSignatures: { 'tool-1': 'tool-sig' },
                },
            };
            yield {
                text: 'Hello',
                swipes: ['Alt AB', 'Alt B'],
                logprobs: { token: 'o' },
                toolCalls: [{ id: 'tool-1' }, { id: 'tool-2' }],
                state: {
                    reasoning: 'r12',
                    images: ['data:image/png;base64,abc'],
                    signature: 'sig-2',
                    toolSignatures: { 'tool-1': 'tool-sig' },
                },
            };
        }

        const events = [];
        for await (const event of normalizeChatCompletionEvents(streamData)) {
            events.push(event);
        }

        expect(events).toEqual([
            {
                type: 'snapshot',
                snapshot: {
                    text: 'Hel',
                    alternatives: ['Alt A'],
                    reasoning: 'r1',
                    reasoningSignature: 'sig-1',
                    images: ['data:image/png;base64,abc'],
                    toolCalls: [{
                        id: 'tool-1',
                        type: undefined,
                        name: undefined,
                        argumentsText: undefined,
                        argumentsJson: undefined,
                        signature: 'tool-sig',
                    }],
                    toolSignatures: { 'tool-1': 'tool-sig' },
                    logprobs: null,
                    finishReason: null,
                    source: 'stream',
                    chunkCount: 1,
                },
            },
            {
                type: 'snapshot',
                snapshot: {
                    text: 'Hello',
                    alternatives: ['Alt AB', 'Alt B'],
                    reasoning: 'r12',
                    reasoningSignature: 'sig-2',
                    images: ['data:image/png;base64,abc'],
                    toolCalls: [
                        {
                            id: 'tool-1',
                            type: undefined,
                            name: undefined,
                            argumentsText: undefined,
                            argumentsJson: undefined,
                            signature: 'tool-sig',
                        },
                        {
                            id: 'tool-2',
                            type: undefined,
                            name: undefined,
                            argumentsText: undefined,
                            argumentsJson: undefined,
                            signature: null,
                        },
                    ],
                    toolSignatures: { 'tool-1': 'tool-sig' },
                    logprobs: { token: 'o' },
                    finishReason: null,
                    source: 'stream',
                    chunkCount: 2,
                },
            },
            {
                type: 'complete',
                result: {
                    completed: true,
                    text: 'Hello',
                    alternatives: ['Alt AB', 'Alt B'],
                    reasoning: 'r12',
                    reasoningSignature: 'sig-2',
                    images: ['data:image/png;base64,abc'],
                    toolCalls: [
                        {
                            id: 'tool-1',
                            type: undefined,
                            name: undefined,
                            argumentsText: undefined,
                            argumentsJson: undefined,
                            signature: 'tool-sig',
                        },
                        {
                            id: 'tool-2',
                            type: undefined,
                            name: undefined,
                            argumentsText: undefined,
                            argumentsJson: undefined,
                            signature: null,
                        },
                    ],
                    toolSignatures: { 'tool-1': 'tool-sig' },
                    logprobs: { token: 'o' },
                    finishReason: null,
                    source: 'stream',
                    chunkCount: 2,
                },
            },
        ]);
    });

    it('sends through the adapter and collects a stable runtime result', async () => {
        const sendChatCompletion = vi.fn(async (_request: HeadlessChatCompletionRequest) => ({
            choices: [{ message: { content: 'Runtime reply.' } }],
        }));
        const adapter = createFakeAdapter(sendChatCompletion);

        await expect(sendChatRuntimeCompletion(adapter, {
            session: createSession(['message-1']),
            messages: [createMessage('message-1', 'user', 'Ping')],
        })).resolves.toMatchObject({
            text: 'Runtime reply.',
            source: 'non-stream',
        });

        expect(sendChatCompletion).toHaveBeenCalledWith({
            messages: [
                expect.objectContaining({ role: 'system' }),
                {
                    role: 'user',
                    content: 'Ping',
                },
            ],
            type: 'quiet',
            signal: undefined,
            jsonSchema: null,
        });
    });

    it('throws a typed normalization error for unsupported raw shapes and failed streams', async () => {
        await expect(collectChatCompletionResult(42)).rejects.toBeInstanceOf(
            ReforgedChatRuntimeNormalizationError,
        );

        async function* brokenStream() {
            yield { text: 'partial' };
            throw new Error('stream exploded');
        }

        await expect(collectChatCompletionResult(brokenStream())).rejects.toMatchObject({
            name: 'ReforgedChatRuntimeNormalizationError',
            message: 'Chat completion stream failed: stream exploded',
        });
    });
});

function createSession(messageIds: string[]): ReforgedChatSession {
    return {
        id: 'session-1',
        character: astra,
        title: 'Astra',
        createdAt: '2026-06-09T00:00:00.000Z',
        updatedAt: '2026-06-09T00:00:00.000Z',
        messageIds,
    };
}

function createMessage(
    id: string,
    role: ReforgedChatMessage['role'],
    content: string,
): ReforgedChatMessage {
    return {
        id,
        sessionId: 'session-1',
        role,
        content,
        createdAt: '2026-06-09T00:00:00.000Z',
        status: 'sent',
        alternatives: [],
        activeAlternativeIndex: -1,
    };
}

function createFakeAdapter(
    sendChatCompletion: (request: HeadlessChatCompletionRequest) => Promise<unknown>,
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
        generateText: vi.fn(async () => ''),
        generateRawData: vi.fn(async () => ({})),
        sendChatCompletion,
    };
}
