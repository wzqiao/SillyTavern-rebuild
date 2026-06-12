import { describe, expect, it } from 'vitest';
import { createChatEngineMessages } from './chatGenerationService';
import { createDirectBackendRequestBody } from '@/engine-adapter/directBackendChatCompletionAdapter';
import type { ReforgedChatLorebookContext, ReforgedChatMessage, ReforgedChatSession } from '@/contracts/chat';
import type { ReforgedPresetPrompt } from '@/contracts/preset';

function createSession(): ReforgedChatSession {
    return {
        id: 'session-1',
        character: {
            id: 'char-1',
            name: '星澜',
            description: 'A wandering star spirit.',
            personality: 'Gentle and curious.',
            scenario: 'A night market between worlds.',
        },
        title: '测试',
        createdAt: '2026-06-12T00:00:00.000Z',
        updatedAt: '2026-06-12T00:00:00.000Z',
        messageIds: ['m1', 'm2'],
    };
}

function createMessages(): ReforgedChatMessage[] {
    return [
        {
            id: 'm1',
            sessionId: 'session-1',
            role: 'user',
            content: '你好',
            createdAt: '2026-06-12T00:00:01.000Z',
            status: 'sent',
            alternatives: [],
            activeAlternativeIndex: -1,
        },
        {
            id: 'm2',
            sessionId: 'session-1',
            role: 'assistant',
            content: '晚上好,旅人。',
            createdAt: '2026-06-12T00:00:02.000Z',
            status: 'sent',
            alternatives: [],
            activeAlternativeIndex: -1,
        },
    ];
}

const PRESET_PROMPTS: ReforgedPresetPrompt[] = [
    { identifier: 'main', name: 'Main', role: 'system', content: 'Write {{char}} reply for {{user}}.', marker: false, enabled: true },
    { identifier: 'worldInfoBefore', name: 'WI Before', role: 'system', content: '', marker: true, enabled: true },
    { identifier: 'charDescription', name: 'Desc', role: 'system', content: '', marker: true, enabled: true },
    { identifier: 'charPersonality', name: 'Pers', role: 'system', content: '', marker: true, enabled: true },
    { identifier: 'scenario', name: 'Scenario', role: 'system', content: '', marker: true, enabled: true },
    { identifier: 'nsfw', name: 'Aux', role: 'system', content: 'Disabled section.', marker: false, enabled: false },
    { identifier: 'worldInfoAfter', name: 'WI After', role: 'system', content: '', marker: true, enabled: true },
    { identifier: 'chatHistory', name: 'History', role: 'system', content: '', marker: true, enabled: true },
    { identifier: 'jailbreak', name: 'PHI', role: 'system', content: 'Final note.', marker: false, enabled: true },
];

const LOREBOOKS: ReforgedChatLorebookContext[] = [{
    id: 'wb-1',
    name: '夜市',
    entries: [],
    beforeEntries: [{ id: 'e1', content: 'The market opens at dusk.' }],
    afterEntries: [{ id: 'e2', content: 'Lanterns never burn out.' }],
} as unknown as ReforgedChatLorebookContext];

describe('createChatEngineMessages with preset prompts', () => {
    it('assembles messages following prompt order with macros and markers', () => {
        const messages = createChatEngineMessages(
            createSession(),
            createMessages(),
            { presetPrompts: PRESET_PROMPTS },
            LOREBOOKS,
        );

        expect(messages.map((message) => message.content)).toEqual([
            'Write 星澜 reply for User.',
            'The market opens at dusk.',
            'A wandering star spirit.',
            'Gentle and curious.',
            'A night market between worlds.',
            'Lanterns never burn out.',
            '你好',
            '晚上好,旅人。',
            'Final note.',
        ]);
        expect(messages[0].role).toBe('system');
        expect(messages[6].role).toBe('user');
        expect(messages[7].role).toBe('assistant');
        // 禁用的 nsfw 段不出现
        expect(messages.some((message) => String(message.content).includes('Disabled'))).toBe(false);
    });

    it('falls back to legacy assembly when no preset prompts are given', () => {
        const messages = createChatEngineMessages(createSession(), createMessages(), {}, []);

        expect(messages[0].role).toBe('system');
        expect(messages[0].content).toContain('roleplaying as 星澜');
        expect(messages).toHaveLength(3);
    });
});

describe('createDirectBackendRequestBody sampling passthrough', () => {
    it('maps preset sampling into legacy backend body fields', () => {
        const body = createDirectBackendRequestBody(
            {
                messages: [{ role: 'user', content: 'hi' }],
                sampling: {
                    temperature: 0.7,
                    topP: 0.9,
                    topK: 40,
                    frequencyPenalty: 0.1,
                    presencePenalty: 0.2,
                    repetitionPenalty: 1.1,
                    minP: 0.05,
                    seed: 42,
                    maxTokens: 400,
                },
            },
            {
                provider: 'openai-compatible',
                baseUrl: 'https://api.example.com/v1',
                model: 'demo',
                apiKey: 'sk-demo',
            },
        );

        expect(body.temperature).toBe(0.7);
        expect(body.top_p).toBe(0.9);
        expect(body.top_k).toBe(40);
        expect(body.frequency_penalty).toBe(0.1);
        expect(body.presence_penalty).toBe(0.2);
        expect(body.repetition_penalty).toBe(1.1);
        expect(body.min_p).toBe(0.05);
        expect(body.seed).toBe(42);
        expect(body.max_tokens).toBe(400);
    });

    it('lets explicit responseLength win over preset maxTokens', () => {
        const body = createDirectBackendRequestBody(
            {
                messages: [{ role: 'user', content: 'hi' }],
                responseLength: 220,
                sampling: { maxTokens: 400 },
            },
            {
                provider: 'openai-compatible',
                baseUrl: 'https://api.example.com/v1',
                model: 'demo',
                apiKey: 'sk-demo',
            },
        );

        expect(body.max_tokens).toBe(220);
    });
});
