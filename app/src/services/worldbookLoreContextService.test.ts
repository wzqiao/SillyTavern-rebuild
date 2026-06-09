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
        } satisfies ReforgedWorldbookLibraryItem, {
            includeInactivePreviewEntries: true,
        })).toEqual({
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

    it('does not inject keyed entries without scan text unless preview mode is explicit', () => {
        const libraryItem = createLibraryItem([
            createEntry({
                id: 'entry-keyed',
                comment: 'Keyed lore',
                content: 'Keyed lore.',
                primaryKeys: ['blue giant'],
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-empty-keyless',
                comment: 'Keyless lore',
                content: 'Keyless lore.',
                insertionOrder: 90,
            }),
            createEntry({
                id: 'entry-constant',
                comment: 'Always on',
                content: 'Constant lore.',
                constant: true,
                insertionOrder: 80,
            }),
            createEntry({
                id: 'entry-preview-continue',
                comment: 'Preview continue trigger',
                content: 'Preview continue lore.',
                primaryKeys: ['blue giant'],
                triggers: ['continue'],
                insertionOrder: 70,
            }),
        ]);

        expect(createChatLorebookContext(libraryItem).entries.map((entry) => entry.id)).toEqual([
            'entry-constant',
        ]);

        expect(createChatLorebookContext(libraryItem, {
            includeInactivePreviewEntries: true,
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-keyed',
            'entry-empty-keyless',
            'entry-constant',
        ]);

        expect(createChatLorebookContext(libraryItem, {
            generationTrigger: 'continue',
            includeInactivePreviewEntries: true,
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-keyed',
            'entry-empty-keyless',
            'entry-constant',
            'entry-preview-continue',
        ]);
    });

    it('activates entries by primary and secondary keys when scan text is provided', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-primary',
                comment: 'Blue giant hazards',
                content: 'Blue giant lore.',
                primaryKeys: ['blue giant'],
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-selective-matched',
                comment: 'Safe course protocol',
                content: 'Safe course lore.',
                primaryKeys: ['course'],
                secondaryKeys: ['safe'],
                selective: true,
                insertionOrder: 90,
            }),
            createEntry({
                id: 'entry-selective-missing-secondary',
                comment: 'Captain protocol',
                content: 'Captain lore.',
                primaryKeys: ['captain'],
                secondaryKeys: ['distress'],
                selective: true,
                insertionOrder: 80,
            }),
            createEntry({
                id: 'entry-unmatched',
                comment: 'Hangar details',
                content: 'Hangar lore.',
                primaryKeys: ['hangar'],
                insertionOrder: 70,
            }),
            createEntry({
                id: 'entry-constant',
                comment: 'Always on',
                content: 'Constant lore.',
                constant: true,
                insertionOrder: 60,
            }),
        ]), {
            scanText: 'A safe course around the blue giant, captain.',
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-primary',
            'entry-selective-matched',
            'entry-constant',
        ]);
    });

    it('filters entries by generation trigger with normal as the default trigger', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-normal',
                comment: 'Normal trigger',
                content: 'Normal lore.',
                primaryKeys: ['primary'],
                triggers: ['normal'],
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-continue',
                comment: 'Continue trigger',
                content: 'Continue lore.',
                primaryKeys: ['primary'],
                triggers: [' continue '],
                insertionOrder: 90,
            }),
            createEntry({
                id: 'entry-unfiltered',
                comment: 'Unfiltered trigger',
                content: 'Unfiltered lore.',
                primaryKeys: ['primary'],
                insertionOrder: 80,
            }),
            createEntry({
                id: 'entry-constant-continue',
                comment: 'Constant continue trigger',
                content: 'Constant continue lore.',
                constant: true,
                triggers: ['continue'],
                insertionOrder: 70,
            }),
        ]), {
            scanText: 'primary',
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-normal',
            'entry-unfiltered',
        ]);
    });

    it('activates entries that match the requested generation trigger', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-normal',
                comment: 'Normal trigger',
                content: 'Normal lore.',
                primaryKeys: ['primary'],
                triggers: ['normal'],
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-continue',
                comment: 'Continue trigger',
                content: 'Continue lore.',
                primaryKeys: ['primary'],
                triggers: ['continue'],
                insertionOrder: 90,
            }),
            createEntry({
                id: 'entry-constant-continue',
                comment: 'Constant continue trigger',
                content: 'Constant continue lore.',
                constant: true,
                triggers: ['continue'],
                insertionOrder: 80,
            }),
            createEntry({
                id: 'entry-unfiltered',
                comment: 'Unfiltered trigger',
                content: 'Unfiltered lore.',
                primaryKeys: ['primary'],
                insertionOrder: 70,
            }),
        ]), {
            generationTrigger: 'continue',
            scanText: 'primary',
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-continue',
            'entry-constant-continue',
            'entry-unfiltered',
        ]);
    });

    it('respects case-sensitive and whole-word matching hints', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-case-sensitive',
                comment: 'Beacon',
                content: 'Uppercase beacon lore.',
                primaryKeys: ['BEACON'],
                caseSensitive: true,
            }),
            createEntry({
                id: 'entry-case-insensitive',
                comment: 'Signal',
                content: 'Signal lore.',
                primaryKeys: ['SIGNAL'],
            }),
            createEntry({
                id: 'entry-whole-word',
                comment: 'Rig',
                content: 'Rig lore.',
                primaryKeys: ['rig'],
                matchWholeWords: true,
            }),
            createEntry({
                id: 'entry-partial-word',
                comment: 'Nav',
                content: 'Nav lore.',
                primaryKeys: ['nav'],
                matchWholeWords: true,
            }),
        ]), {
            scanText: 'The beacon signal mentions a cargo rig and navigation drift.',
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-case-insensitive',
            'entry-whole-word',
        ]);
    });

    it('uses Unicode-aware whole-word boundaries', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-cjk-contained',
                comment: 'Navigation',
                content: 'Navigation lore.',
                primaryKeys: ['导航'],
                matchWholeWords: true,
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-cjk-delimited',
                comment: 'Signal',
                content: 'Signal lore.',
                primaryKeys: ['信标'],
                matchWholeWords: true,
                insertionOrder: 90,
            }),
        ]), {
            scanText: '超导航系统离线。发现 信标。',
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-cjk-delimited',
        ]);
    });

    it('can build scan text from chat messages and the next user message', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-from-next',
                comment: 'Blue giant hazards',
                content: 'Blue giant lore.',
                primaryKeys: ['blue giant'],
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-from-history',
                comment: 'Safe course protocol',
                content: 'Safe course lore.',
                primaryKeys: ['safe course'],
                insertionOrder: 90,
            }),
            createEntry({
                id: 'entry-from-failed-message',
                comment: 'Failed signal',
                content: 'Failed lore.',
                primaryKeys: ['distress signal'],
                insertionOrder: 80,
            }),
        ]), {
            messages: [
                { content: 'Plot a safe course.', status: 'sent' },
                { content: 'Ignore this distress signal.', status: 'failed' },
            ],
            nextMessage: 'Skirt the blue giant.',
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-from-next',
            'entry-from-history',
        ]);
    });
});

function createLibraryItem(entries: ReforgedWorldbookEntry[]): ReforgedWorldbookLibraryItem {
    return {
        id: 'worldbook-1',
        importedAt: '2026-06-09T00:00:00.000Z',
        source: {
            fileName: 'astra-routes-worldbook.json',
            format: 'json',
        },
        warnings: [],
        worldbook: {
            name: 'Astra Route Notes',
            source: 'sillytavern-world-info',
            raw: { entries: {} },
            entries,
        },
    };
}

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
