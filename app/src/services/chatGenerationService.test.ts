import { describe, expect, it } from 'vitest';
import type {
    ReforgedChatCharacterContext,
    ReforgedChatLorebookContext,
    ReforgedChatMessage,
    ReforgedChatSession,
} from '@/contracts/chat';
import {
    createChatEngineMessages,
    createChatGenerationRequest,
    readReforgedSessionMessages,
} from './chatGenerationService';

const astra: ReforgedChatCharacterContext = {
    id: 'character-astra',
    name: 'Astra',
    description: 'A navigator who reads star maps like sheet music.',
    personality: 'Calm, precise, quietly playful.',
    scenario: 'A damaged survey ship is drifting near a blue giant.',
};

describe('chatGenerationService', () => {
    it('maps a chat session into a headless generation request', () => {
        const session = createSession(['message-1', 'message-2']);
        const messages = [
            createMessage('message-1', 'assistant', 'Coordinates locked.'),
            createMessage('message-2', 'user', 'Plot a safe course.'),
        ];

        expect(createChatGenerationRequest({
            session,
            messages,
            generation: {
                api: 'openai',
                responseLength: 128,
            },
        })).toEqual({
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
                    content: 'Coordinates locked.',
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
    });

    it('prefers an explicit system prompt and skips failed or empty messages', () => {
        const session = createSession(['message-1', 'message-2', 'message-3', 'message-4']);
        const messages = [
            createMessage('message-1', 'assistant', 'Coordinates locked.'),
            createMessage('message-2', 'user', '  '),
            createMessage('message-3', 'assistant', 'Provider failed', 'failed'),
            createMessage('message-4', 'user', 'Continue.'),
        ];

        expect(createChatEngineMessages(session, messages, {
            systemPrompt: 'Custom system prompt.',
        })).toEqual([
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
                content: 'Continue.',
            },
        ]);
    });

    it('appends selected worldbook entries to the system prompt', () => {
        const session = createSession(['message-1']);
        const messages = [
            createMessage('message-1', 'user', 'Plot a safe course.'),
        ];

        expect(createChatEngineMessages(session, messages, {}, [createLorebook()])).toEqual([
            {
                role: 'system',
                content: [
                    'You are roleplaying as Astra. Stay in character and continue the scene naturally.',
                    'Description: A navigator who reads star maps like sheet music.',
                    'Personality: Calm, precise, quietly playful.',
                    'Scenario: A damaged survey ship is drifting near a blue giant.',
                    'World lore context:',
                    'Use these selected lore notes as additional scene context.',
                    'Lorebook: Astra Route Notes',
                    [
                        'The blue giant throws off cheap sensors.',
                        'A safe course means trading speed for silence.',
                    ].join('\n\n'),
                ].join('\n\n'),
            },
            {
                role: 'user',
                content: 'Plot a safe course.',
            },
        ]);
    });

    it('formats routed worldbook entries as separate prompt sections', () => {
        const session = createSession(['message-1']);
        const messages = [
            createMessage('message-1', 'user', 'Plot a safe course.'),
        ];

        expect(createChatEngineMessages(session, messages, {}, [createRoutedLorebook()])).toEqual([
            {
                role: 'system',
                content: [
                    'You are roleplaying as Astra. Stay in character and continue the scene naturally.',
                    'Description: A navigator who reads star maps like sheet music.',
                    'Personality: Calm, precise, quietly playful.',
                    'Scenario: A damaged survey ship is drifting near a blue giant.',
                    'World lore context:',
                    'Use these selected lore notes as additional scene context.',
                    'Lorebook: Astra Route Notes',
                    'Before character:\nBefore lore.',
                    'After character:\nAfter lore.',
                    'Author note before:\nAuthor note before lore.',
                    'Author note after:\nAuthor note after lore.',
                    'Depth injections:',
                    'Depth 4 (system):\nDepth lore.',
                    'Outlet injections:',
                    'Outlet navigation:\nOutlet lore.',
                ].join('\n\n'),
            },
            {
                role: 'user',
                content: 'Plot a safe course.',
            },
        ]);
    });

    it('reads messages in session order and ignores missing ids', () => {
        const session = createSession(['message-2', 'missing', 'message-1']);
        const messages = [
            createMessage('message-1', 'assistant', 'First in storage.'),
            createMessage('message-2', 'user', 'First in session.'),
        ];

        expect(readReforgedSessionMessages(session, messages).map((message) => message.id)).toEqual([
            'message-2',
            'message-1',
        ]);
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

function createLorebook(): ReforgedChatLorebookContext {
    return {
        id: 'worldbook-1',
        name: 'Astra Route Notes',
        entries: [
            {
                id: 'entry-high',
                title: 'Blue giant hazards',
                content: 'The blue giant throws off cheap sensors.',
            },
            {
                id: 'entry-low',
                title: 'Safe course protocol',
                content: 'A safe course means trading speed for silence.',
            },
        ],
    };
}

function createRoutedLorebook(): ReforgedChatLorebookContext {
    return {
        id: 'worldbook-1',
        name: 'Astra Route Notes',
        entries: [
            {
                id: 'entry-before',
                content: 'Before lore.',
            },
            {
                id: 'entry-after',
                content: 'After lore.',
            },
        ],
        beforeEntries: [
            {
                id: 'entry-before',
                content: 'Before lore.',
            },
        ],
        afterEntries: [
            {
                id: 'entry-after',
                content: 'After lore.',
            },
        ],
        authorNoteBeforeEntries: [
            {
                id: 'entry-author-before',
                content: 'Author note before lore.',
            },
        ],
        authorNoteAfterEntries: [
            {
                id: 'entry-author-after',
                content: 'Author note after lore.',
            },
        ],
        depthEntries: [
            {
                depth: 4,
                role: 'system',
                entries: [
                    {
                        id: 'entry-depth',
                        content: 'Depth lore.',
                    },
                ],
            },
        ],
        outletEntries: {
            navigation: [
                {
                    id: 'entry-outlet',
                    content: 'Outlet lore.',
                },
            ],
        },
    };
}

function createMessage(
    id: string,
    role: ReforgedChatMessage['role'],
    content: string,
    status: ReforgedChatMessage['status'] = 'sent',
): ReforgedChatMessage {
    return {
        id,
        sessionId: 'session-1',
        role,
        content,
        createdAt: '2026-06-09T00:00:00.000Z',
        status,
        alternatives: [],
        activeAlternativeIndex: -1,
    };
}
