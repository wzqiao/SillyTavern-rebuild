import { describe, expect, it } from 'vitest';
import type {
    ReforgedWorldbookEntry,
    ReforgedWorldbookLibraryItem,
} from '@/contracts/worldbook';
import { createChatLorebookContext } from './worldbookLoreContextService';

describe('createChatLorebookContext', () => {
    it('projects a stored worldbook into injection-ready lore context', () => {
        expect(createChatLorebookContext({
            id: 'worldbook-1',
            importedAt: '2026-06-09T00:00:00.000Z',
            source: {
                fileName: 'astra-routes-worldbook.json',
                format: 'json',
            },
            warnings: ['kept out of chat context'],
            worldbook: {
                name: 'Astra Route Notes',
                source: 'sillytavern-world-info',
                raw: { entries: {} },
                entries: [
                    createEntry({
                        id: 'entry-low',
                        comment: '',
                        content: ' A safe course means trading speed for silence. ',
                        primaryKeys: ['captain', 'course'],
                        insertionOrder: 90,
                    }),
                    createEntry({
                        id: 'entry-disabled',
                        comment: 'Disabled lore',
                        content: 'This should not be injected.',
                        enabled: false,
                        insertionOrder: 999,
                    }),
                    createEntry({
                        id: 'entry-empty',
                        comment: 'Empty lore',
                        content: '   ',
                        insertionOrder: 998,
                    }),
                    createEntry({
                        id: 'entry-high',
                        comment: 'Blue giant hazards',
                        content: 'The blue giant throws off cheap sensors.',
                        insertionOrder: 120,
                    }),
                ],
            },
        } satisfies ReforgedWorldbookLibraryItem)).toEqual({
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
                    title: 'captain, course',
                    content: 'A safe course means trading speed for silence.',
                },
            ],
        });
    });
});

function createEntry(overrides: Partial<ReforgedWorldbookEntry> & Pick<ReforgedWorldbookEntry, 'id' | 'comment' | 'content'>): ReforgedWorldbookEntry {
    return {
        uid: overrides.id,
        primaryKeys: [],
        secondaryKeys: [],
        enabled: true,
        constant: false,
        selective: false,
        selectiveLogic: null,
        insertionOrder: 100,
        displayIndex: null,
        position: 'before',
        positionRaw: 0,
        role: null,
        depth: null,
        scanDepth: null,
        probability: null,
        useProbability: true,
        caseSensitive: null,
        matchWholeWords: null,
        useGroupScoring: null,
        vectorized: false,
        addMemo: false,
        excludeRecursion: false,
        preventRecursion: false,
        delayUntilRecursion: false,
        ignoreBudget: false,
        group: '',
        groupOverride: false,
        groupWeight: null,
        outletName: '',
        automationId: '',
        sticky: null,
        cooldown: null,
        delay: null,
        triggers: [],
        matchPersonaDescription: false,
        matchCharacterDescription: false,
        matchCharacterPersonality: false,
        matchCharacterDepthPrompt: false,
        matchScenario: false,
        matchCreatorNotes: false,
        extensionsRaw: { private: 'not injected' },
        raw: { content: 'raw should not leak' },
        ...overrides,
    };
}
