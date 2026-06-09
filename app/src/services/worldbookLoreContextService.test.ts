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
        })).toMatchObject({
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

    it('filters activated entries by probability with an injectable random source', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-probability-pass',
                comment: 'Probability pass',
                content: 'Probability pass lore.',
                primaryKeys: ['primary'],
                probability: 50,
                useProbability: true,
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-probability-fail',
                comment: 'Probability fail',
                content: 'Probability fail lore.',
                primaryKeys: ['primary'],
                probability: 50,
                useProbability: true,
                insertionOrder: 90,
            }),
            createEntry({
                id: 'entry-probability-zero',
                comment: 'Probability zero',
                content: 'Probability zero lore.',
                primaryKeys: ['primary'],
                probability: 0,
                useProbability: true,
                insertionOrder: 80,
            }),
            createEntry({
                id: 'entry-probability-hundred',
                comment: 'Probability hundred',
                content: 'Probability hundred lore.',
                primaryKeys: ['primary'],
                probability: 100,
                useProbability: true,
                insertionOrder: 70,
            }),
            createEntry({
                id: 'entry-probability-disabled',
                comment: 'Probability disabled',
                content: 'Probability disabled lore.',
                primaryKeys: ['primary'],
                probability: 0,
                useProbability: false,
                insertionOrder: 60,
            }),
            createEntry({
                id: 'entry-probability-null',
                comment: 'Probability null',
                content: 'Probability null lore.',
                primaryKeys: ['primary'],
                probability: null,
                useProbability: true,
                insertionOrder: 50,
            }),
            createEntry({
                id: 'entry-constant-probability-fail',
                comment: 'Constant probability fail',
                content: 'Constant probability fail lore.',
                constant: true,
                probability: 0,
                useProbability: true,
                insertionOrder: 40,
            }),
        ]), {
            random: createRandomSequence([0.5, 0.51, 0.01, 0.42]),
            scanText: 'primary',
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-probability-pass',
            'entry-probability-hundred',
            'entry-probability-disabled',
            'entry-probability-null',
        ]);
    });

    it('does not apply probability while previewing inactive entries', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-probability-preview',
                comment: 'Probability preview',
                content: 'Probability preview lore.',
                primaryKeys: ['primary'],
                probability: 0,
                useProbability: true,
            }),
        ]), {
            includeInactivePreviewEntries: true,
            random: () => {
                throw new Error('Preview should not roll probability.');
            },
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-probability-preview',
        ]);
    });

    it('filters inclusion groups by override priority and weighted random winners', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-override-low',
                comment: 'Override low',
                content: 'Override low lore.',
                primaryKeys: ['primary'],
                group: 'override-group',
                groupOverride: true,
                insertionOrder: 90,
            }),
            createEntry({
                id: 'entry-override-high',
                comment: 'Override high',
                content: 'Override high lore.',
                primaryKeys: ['primary'],
                group: 'override-group',
                groupOverride: true,
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-weight-low',
                comment: 'Weight low',
                content: 'Weight low lore.',
                primaryKeys: ['primary'],
                group: 'weighted-group',
                groupWeight: 10,
                insertionOrder: 80,
            }),
            createEntry({
                id: 'entry-weight-high',
                comment: 'Weight high',
                content: 'Weight high lore.',
                primaryKeys: ['primary'],
                group: 'weighted-group',
                groupWeight: 90,
                insertionOrder: 70,
            }),
            createEntry({
                id: 'entry-ungrouped',
                comment: 'Ungrouped',
                content: 'Ungrouped lore.',
                primaryKeys: ['primary'],
                insertionOrder: 60,
            }),
        ]), {
            random: () => 0.2,
            scanText: 'primary',
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-override-high',
            'entry-weight-high',
            'entry-ungrouped',
        ]);
    });

    it('applies inclusion group filtering after constant activation and before probability rolls', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-constant-loser',
                comment: 'Constant loser',
                content: 'Constant loser lore.',
                constant: true,
                group: 'constant-group',
                groupWeight: 10,
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-keyed-winner-fails-probability',
                comment: 'Keyed winner fails probability',
                content: 'Keyed winner fails probability lore.',
                primaryKeys: ['primary'],
                group: 'constant-group',
                groupWeight: 90,
                probability: 50,
                useProbability: true,
                insertionOrder: 90,
            }),
            createEntry({
                id: 'entry-ungrouped',
                comment: 'Ungrouped',
                content: 'Ungrouped lore.',
                primaryKeys: ['primary'],
                insertionOrder: 80,
            }),
        ]), {
            random: createRandomSequence([0.2, 0.51]),
            scanText: 'primary',
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-ungrouped',
        ]);
    });

    it('does not filter inclusion groups while previewing inactive entries', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-preview-first',
                comment: 'Preview first',
                content: 'Preview first lore.',
                primaryKeys: ['primary'],
                group: 'preview-group',
                groupWeight: 1,
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-preview-second',
                comment: 'Preview second',
                content: 'Preview second lore.',
                primaryKeys: ['primary'],
                group: 'preview-group',
                groupWeight: 1,
                insertionOrder: 90,
            }),
        ]), {
            includeInactivePreviewEntries: true,
            random: () => {
                throw new Error('Preview should not roll inclusion groups.');
            },
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-preview-first',
            'entry-preview-second',
        ]);
    });

    it('ignores empty group names and blank CSV tokens during inclusion-group filtering', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-empty-group',
                comment: 'Empty group',
                content: 'Empty group lore.',
                primaryKeys: ['primary'],
                group: '',
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-blank-csv-group',
                comment: 'Blank CSV group',
                content: 'Blank CSV group lore.',
                primaryKeys: ['primary'],
                group: ' , ',
                insertionOrder: 90,
            }),
            createEntry({
                id: 'entry-alpha-low',
                comment: 'Alpha low',
                content: 'Alpha low lore.',
                primaryKeys: ['primary'],
                group: 'alpha, , ',
                groupWeight: 1,
                insertionOrder: 80,
            }),
            createEntry({
                id: 'entry-alpha-high',
                comment: 'Alpha high',
                content: 'Alpha high lore.',
                primaryKeys: ['primary'],
                group: 'alpha',
                groupWeight: 99,
                insertionOrder: 70,
            }),
        ]), {
            random: () => 0.5,
            scanText: 'primary',
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-empty-group',
            'entry-blank-csv-group',
            'entry-alpha-high',
        ]);
    });

    it('filters scored inclusion-group entries before weighted random winners', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-scored-low',
                comment: 'Scored low',
                content: 'Scored low lore.',
                primaryKeys: ['primary', 'missing'],
                group: 'score-group',
                groupWeight: 99,
                useGroupScoring: true,
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-scored-high',
                comment: 'Scored high',
                content: 'Scored high lore.',
                primaryKeys: ['primary', 'bonus'],
                group: 'score-group',
                groupWeight: 1,
                useGroupScoring: true,
                insertionOrder: 90,
            }),
        ]), {
            random: () => 0,
            scanText: 'primary bonus',
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-scored-high',
        ]);
    });

    it('keeps unscored inclusion-group entries while removing scored losers', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-scored-low',
                comment: 'Scored low',
                content: 'Scored low lore.',
                primaryKeys: ['primary'],
                group: 'mixed-score-group',
                groupWeight: 1,
                useGroupScoring: true,
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-unscored-low',
                comment: 'Unscored low',
                content: 'Unscored low lore.',
                primaryKeys: ['primary'],
                group: 'mixed-score-group',
                groupWeight: 99,
                useGroupScoring: false,
                insertionOrder: 90,
            }),
            createEntry({
                id: 'entry-scored-high',
                comment: 'Scored high',
                content: 'Scored high lore.',
                primaryKeys: ['primary', 'bonus'],
                group: 'mixed-score-group',
                groupWeight: 1,
                useGroupScoring: true,
                insertionOrder: 80,
            }),
        ]), {
            random: () => 0.5,
            scanText: 'primary bonus',
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-unscored-low',
        ]);
    });

    it('uses default group scoring for null entry hints', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-default-scored-low',
                comment: 'Default scored low',
                content: 'Default scored low lore.',
                primaryKeys: ['primary'],
                group: 'default-score-group',
                groupWeight: 99,
                useGroupScoring: null,
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-default-scored-high',
                comment: 'Default scored high',
                content: 'Default scored high lore.',
                primaryKeys: ['primary', 'bonus'],
                group: 'default-score-group',
                groupWeight: 1,
                useGroupScoring: null,
                insertionOrder: 90,
            }),
        ]), {
            defaultUseGroupScoring: true,
            random: () => 0,
            scanText: 'primary bonus',
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-default-scored-high',
        ]);
    });

    it('scores only positive selective secondary logic for inclusion groups', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-and-any-score',
                comment: 'AND ANY score',
                content: 'AND ANY score lore.',
                primaryKeys: ['primary'],
                secondaryKeys: ['alpha', 'beta'],
                selective: true,
                selectiveLogic: 0,
                group: 'selective-score-group',
                useGroupScoring: true,
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-and-all-partial-score',
                comment: 'AND ALL partial score',
                content: 'AND ALL partial score lore.',
                primaryKeys: ['primary'],
                secondaryKeys: ['alpha', 'missing'],
                selective: true,
                selectiveLogic: 3,
                group: 'selective-score-group',
                useGroupScoring: true,
                insertionOrder: 90,
            }),
            createEntry({
                id: 'entry-not-any-no-secondary-score',
                comment: 'NOT ANY no secondary score',
                content: 'NOT ANY no secondary score lore.',
                primaryKeys: ['primary'],
                secondaryKeys: ['missing'],
                selective: true,
                selectiveLogic: 2,
                group: 'selective-score-group',
                useGroupScoring: true,
                insertionOrder: 80,
            }),
        ]), {
            random: () => 0,
            scanText: 'primary alpha beta',
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-and-any-score',
        ]);
    });

    it('scores group entries against global sources, scan injects, and recursive content', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-seed',
                comment: 'Seed',
                content: 'Recursive route appears later.',
                primaryKeys: ['primary route'],
                insertionOrder: 120,
            }),
            createEntry({
                id: 'entry-scored-low',
                comment: 'Scored low',
                content: 'Scored low lore.',
                primaryKeys: ['recursive route'],
                group: 'context-score-group',
                useGroupScoring: true,
                insertionOrder: 110,
            }),
            createEntry({
                id: 'entry-scored-high',
                comment: 'Scored high',
                content: 'Scored high lore.',
                primaryKeys: ['recursive route'],
                secondaryKeys: ['persona marker', 'inject marker'],
                selective: true,
                selectiveLogic: 0,
                group: 'context-score-group',
                useGroupScoring: true,
                matchPersonaDescription: true,
                insertionOrder: 100,
            }),
        ]), {
            messages: [
                { content: 'The primary route is active.', status: 'sent' },
            ],
            maxRecursionSteps: 2,
            random: () => 0,
            recursive: true,
            scanInjects: ['Inject marker is present.'],
            scanSources: {
                personaDescription: 'Persona marker is present.',
            },
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-seed',
            'entry-scored-high',
        ]);
    });

    it('matches SillyTavern selective logic modes for secondary keys', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'and-any-one',
                comment: 'AND ANY one',
                content: 'AND ANY lore.',
                primaryKeys: ['primary'],
                secondaryKeys: ['alpha', 'missing'],
                selective: true,
                selectiveLogic: 0,
            }),
            createEntry({
                id: 'and-any-none',
                comment: 'AND ANY none',
                content: 'AND ANY missing lore.',
                primaryKeys: ['primary'],
                secondaryKeys: ['missing'],
                selective: true,
                selectiveLogic: 0,
            }),
            createEntry({
                id: 'not-all-partial',
                comment: 'NOT ALL partial',
                content: 'NOT ALL partial lore.',
                primaryKeys: ['primary'],
                secondaryKeys: ['alpha', 'missing'],
                selective: true,
                selectiveLogic: 1,
            }),
            createEntry({
                id: 'not-all-complete',
                comment: 'NOT ALL complete',
                content: 'NOT ALL complete lore.',
                primaryKeys: ['primary'],
                secondaryKeys: ['alpha', 'beta'],
                selective: true,
                selectiveLogic: 1,
            }),
            createEntry({
                id: 'not-any-none',
                comment: 'NOT ANY none',
                content: 'NOT ANY lore.',
                primaryKeys: ['primary'],
                secondaryKeys: ['missing'],
                selective: true,
                selectiveLogic: 2,
            }),
            createEntry({
                id: 'not-any-one',
                comment: 'NOT ANY one',
                content: 'NOT ANY matched lore.',
                primaryKeys: ['primary'],
                secondaryKeys: ['alpha', 'missing'],
                selective: true,
                selectiveLogic: 2,
            }),
            createEntry({
                id: 'and-all-complete',
                comment: 'AND ALL complete',
                content: 'AND ALL lore.',
                primaryKeys: ['primary'],
                secondaryKeys: ['alpha', 'beta'],
                selective: true,
                selectiveLogic: 3,
            }),
            createEntry({
                id: 'and-all-partial',
                comment: 'AND ALL partial',
                content: 'AND ALL partial lore.',
                primaryKeys: ['primary'],
                secondaryKeys: ['alpha', 'missing'],
                selective: true,
                selectiveLogic: 3,
            }),
        ]), {
            scanText: 'The primary route includes alpha and beta markers.',
        }).entries.map((entry) => entry.id)).toEqual([
            'and-any-one',
            'not-all-partial',
            'not-any-none',
            'and-all-complete',
        ]);
    });

    it('falls back to AND ANY logic and activates primary-only selective entries', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'null-logic',
                comment: 'Null logic',
                content: 'Null logic lore.',
                primaryKeys: ['primary'],
                secondaryKeys: ['alpha'],
                selective: true,
                selectiveLogic: null,
            }),
            createEntry({
                id: 'unknown-logic',
                comment: 'Unknown logic',
                content: 'Unknown logic lore.',
                primaryKeys: ['primary'],
                secondaryKeys: ['alpha'],
                selective: true,
                selectiveLogic: 99,
            }),
            createEntry({
                id: 'unknown-logic-missing-secondary',
                comment: 'Unknown logic missing secondary',
                content: 'Unknown missing lore.',
                primaryKeys: ['primary'],
                secondaryKeys: ['missing'],
                selective: true,
                selectiveLogic: 99,
            }),
            createEntry({
                id: 'empty-secondary',
                comment: 'Empty secondary',
                content: 'Empty secondary lore.',
                primaryKeys: ['primary'],
                secondaryKeys: [],
                selective: true,
                selectiveLogic: 3,
            }),
        ]), {
            scanText: 'The primary route includes alpha markers.',
        }).entries.map((entry) => entry.id)).toEqual([
            'null-logic',
            'unknown-logic',
            'empty-secondary',
        ]);
    });

    it('keeps trigger filtering while previewing inactive selective entries', () => {
        const libraryItem = createLibraryItem([
            createEntry({
                id: 'normal-selective-preview',
                comment: 'Normal selective preview',
                content: 'Normal selective preview lore.',
                primaryKeys: ['primary'],
                secondaryKeys: ['missing'],
                selective: true,
                selectiveLogic: 3,
                triggers: ['normal'],
                insertionOrder: 100,
            }),
            createEntry({
                id: 'continue-selective-preview',
                comment: 'Continue selective preview',
                content: 'Continue selective preview lore.',
                primaryKeys: ['primary'],
                secondaryKeys: ['missing'],
                selective: true,
                selectiveLogic: 3,
                triggers: ['continue'],
                insertionOrder: 90,
            }),
            createEntry({
                id: 'unfiltered-selective-preview',
                comment: 'Unfiltered selective preview',
                content: 'Unfiltered selective preview lore.',
                primaryKeys: ['primary'],
                secondaryKeys: ['missing'],
                selective: true,
                selectiveLogic: 3,
                insertionOrder: 80,
            }),
        ]);

        expect(createChatLorebookContext(libraryItem, {
            scanText: 'primary',
        }).entries.map((entry) => entry.id)).toEqual([]);

        expect(createChatLorebookContext(libraryItem, {
            includeInactivePreviewEntries: true,
            scanText: 'primary',
        }).entries.map((entry) => entry.id)).toEqual([
            'normal-selective-preview',
            'unfiltered-selective-preview',
        ]);

        expect(createChatLorebookContext(libraryItem, {
            generationTrigger: 'continue',
            includeInactivePreviewEntries: true,
            scanText: 'primary',
        }).entries.map((entry) => entry.id)).toEqual([
            'continue-selective-preview',
            'unfiltered-selective-preview',
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

    it('uses default matching options when entry hints are unset', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-default-case-sensitive',
                comment: 'Default case sensitive',
                content: 'Default case lore.',
                primaryKeys: ['BEACON'],
                caseSensitive: null,
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-default-whole-word',
                comment: 'Default whole word',
                content: 'Default whole-word lore.',
                primaryKeys: ['nav'],
                matchWholeWords: null,
                insertionOrder: 90,
            }),
            createEntry({
                id: 'entry-case-override',
                comment: 'Case override',
                content: 'Case override lore.',
                primaryKeys: ['SIGNAL'],
                caseSensitive: false,
                insertionOrder: 80,
            }),
            createEntry({
                id: 'entry-whole-word-override',
                comment: 'Whole-word override',
                content: 'Whole-word override lore.',
                primaryKeys: ['rig'],
                matchWholeWords: false,
                insertionOrder: 70,
            }),
            createEntry({
                id: 'entry-default-multi-word-phrase',
                comment: 'Default multi-word phrase',
                content: 'Default multi-word phrase lore.',
                primaryKeys: ['cargo rig'],
                matchWholeWords: null,
                insertionOrder: 60,
            }),
            createEntry({
                id: 'entry-regex-default-override',
                comment: 'Regex default override',
                content: 'Regex default override lore.',
                primaryKeys: ['/blue\\s+giant/i'],
                caseSensitive: null,
                matchWholeWords: null,
                insertionOrder: 50,
            }),
        ]), {
            defaultCaseSensitive: true,
            defaultMatchWholeWords: true,
            scanText: 'The beacon signal near a BLUE giant mentions navigation and cargo rigging.',
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-case-override',
            'entry-whole-word-override',
            'entry-default-multi-word-phrase',
            'entry-regex-default-override',
        ]);
    });

    it('supports SillyTavern-style regex keys before plaintext matching options', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-regex-case',
                comment: 'Regex case override',
                content: 'Regex case lore.',
                primaryKeys: ['/blue\\s+giant/i'],
                caseSensitive: true,
                matchWholeWords: true,
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-regex-whole-word',
                comment: 'Regex whole-word override',
                content: 'Regex whole-word lore.',
                primaryKeys: ['/rig/i'],
                matchWholeWords: true,
                insertionOrder: 90,
            }),
            createEntry({
                id: 'entry-secondary-regex',
                comment: 'Secondary regex',
                content: 'Secondary regex lore.',
                primaryKeys: ['hazard'],
                secondaryKeys: ['/alpha\\/(?:beta)/i'],
                selective: true,
                insertionOrder: 80,
            }),
            createEntry({
                id: 'entry-invalid-regex',
                comment: 'Invalid regex',
                content: 'Invalid regex lore.',
                primaryKeys: ['/literal route/ii'],
                insertionOrder: 70,
            }),
            createEntry({
                id: 'entry-unescaped-slash',
                comment: 'Unescaped slash regex',
                content: 'Unescaped slash lore.',
                primaryKeys: ['/alpha/beta/i'],
                insertionOrder: 60,
            }),
        ]), {
            scanText: 'The BLUE giant hazard sits beside cargo rigging and ALPHA/beta, not a literal route.',
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-regex-case',
            'entry-regex-whole-word',
            'entry-secondary-regex',
        ]);
    });

    it('matches whole-word multi-word keys as exact phrases like SillyTavern', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-multi-word-phrase',
                comment: 'Cargo rig phrase',
                content: 'Cargo rig phrase lore.',
                primaryKeys: ['cargo rig'],
                matchWholeWords: true,
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-single-word',
                comment: 'Rig single word',
                content: 'Rig single-word lore.',
                primaryKeys: ['rig'],
                matchWholeWords: true,
                insertionOrder: 90,
            }),
        ]), {
            scanText: 'The cargo rigging crew reroutes power.',
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-multi-word-phrase',
        ]);
    });

    it('substitutes macro values in primary and secondary keys before matching', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-primary-macro',
                comment: 'Primary macro',
                content: 'Primary macro lore.',
                primaryKeys: ['{{ route }}'],
                insertionOrder: 120,
            }),
            createEntry({
                id: 'entry-secondary-macro',
                comment: 'Secondary macro',
                content: 'Secondary macro lore.',
                primaryKeys: ['course'],
                secondaryKeys: ['{{marker}}'],
                selective: true,
                insertionOrder: 110,
            }),
            createEntry({
                id: 'entry-empty-primary-macro',
                comment: 'Empty primary macro',
                content: 'Empty primary macro lore.',
                primaryKeys: ['{{emptyRoute}}'],
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-blank-primary-macro',
                comment: 'Blank primary macro',
                content: 'Blank primary macro lore.',
                primaryKeys: ['{{blankRoute}}'],
                insertionOrder: 90,
            }),
        ]), {
            macroValues: {
                blankRoute: '   ',
                emptyRoute: null,
                marker: 'safe marker',
                route: 'blue route',
            },
            scanText: 'The blue route includes a safe marker and a course.',
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-primary-macro',
            'entry-secondary-macro',
        ]);
    });

    it('uses a custom macro substitution function for keys and content', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-custom-macro',
                comment: 'Custom macro',
                content: 'Hello {{user}}.',
                primaryKeys: ['{{route}}'],
            }),
        ]), {
            macroValues: {
                route: 'ignored route',
                user: 'ignored user',
            },
            scanText: 'The blue route is active.',
            substituteMacros: (text) => text
                .replaceAll('{{route}}', 'blue route')
                .replaceAll('{{user}}', 'Captain'),
        }).entries).toEqual([
            {
                id: 'entry-custom-macro',
                title: 'Custom macro',
                content: 'Hello Captain.',
            },
        ]);
    });

    it('substitutes entry content after activation without mutating the stored worldbook entry', () => {
        const entry = createEntry({
            id: 'entry-content-macro',
            comment: 'Content macro',
            content: 'Hello {{user}} and {{unknown}}.',
            constant: true,
        });
        const libraryItem = createLibraryItem([entry]);

        expect(createChatLorebookContext(libraryItem, {
            macroValues: {
                user: 'Captain',
            },
        }).entries[0]?.content).toBe('Hello Captain and {{unknown}}.');

        expect(createChatLorebookContext(libraryItem, {
            macroValues: {
                user: 'Navigator',
            },
        }).entries[0]?.content).toBe('Hello Navigator and {{unknown}}.');

        expect(entry.content).toBe('Hello {{user}} and {{unknown}}.');
    });

    it('uses macro-substituted keys when scoring inclusion-group candidates', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-scored-macro-low',
                comment: 'Scored macro low',
                content: 'Scored macro low lore.',
                primaryKeys: ['primary', '{{missingBonus}}'],
                group: 'macro-score-group',
                groupWeight: 99,
                useGroupScoring: true,
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-scored-macro-high',
                comment: 'Scored macro high',
                content: 'Scored macro high lore.',
                primaryKeys: ['primary', '{{bonus}}'],
                group: 'macro-score-group',
                groupWeight: 1,
                useGroupScoring: true,
                insertionOrder: 90,
            }),
        ]), {
            macroValues: {
                bonus: 'bonus',
            },
            random: () => 0,
            scanText: 'The primary route includes a bonus marker.',
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-scored-macro-high',
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

    it('limits history scanning per entry with scanDepth while still scanning the next message', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-outside-depth',
                comment: 'Outside depth',
                content: 'Outside depth lore.',
                primaryKeys: ['ancient beacon'],
                scanDepth: 2,
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-inside-depth',
                comment: 'Inside depth',
                content: 'Inside depth lore.',
                primaryKeys: ['recent beacon'],
                scanDepth: 2,
                insertionOrder: 90,
            }),
            createEntry({
                id: 'entry-full-history',
                comment: 'Full history',
                content: 'Full history lore.',
                primaryKeys: ['ancient beacon'],
                scanDepth: null,
                insertionOrder: 80,
            }),
            createEntry({
                id: 'entry-next-message',
                comment: 'Next message',
                content: 'Next message lore.',
                primaryKeys: ['future beacon'],
                scanDepth: 1,
                insertionOrder: 70,
            }),
        ]), {
            messages: [
                { content: 'The ancient beacon was mentioned long ago.', status: 'sent' },
                { content: 'The recent beacon is still visible.', status: 'sent' },
            ],
            nextMessage: 'Ask about the future beacon.',
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-inside-depth',
            'entry-full-history',
            'entry-next-message',
        ]);
    });

    it('applies scanDepth to selective secondary keys', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-secondary-outside-depth',
                comment: 'Secondary outside depth',
                content: 'Secondary outside depth lore.',
                primaryKeys: ['primary signal'],
                secondaryKeys: ['old marker'],
                selective: true,
                scanDepth: 1,
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-secondary-inside-depth',
                comment: 'Secondary inside depth',
                content: 'Secondary inside depth lore.',
                primaryKeys: ['primary signal'],
                secondaryKeys: ['recent marker'],
                selective: true,
                scanDepth: 1,
                insertionOrder: 90,
            }),
        ]), {
            messages: [
                { content: 'The primary signal carried an old marker.', status: 'sent' },
                { content: 'The primary signal now carries a recent marker.', status: 'sent' },
            ],
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-secondary-inside-depth',
        ]);
    });

    it('uses defaultScanDepth and normalizes scanDepth edge values', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-default-depth-outside',
                comment: 'Default depth outside',
                content: 'Default depth outside lore.',
                primaryKeys: ['old signal'],
                scanDepth: null,
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-fraction-depth',
                comment: 'Fraction depth',
                content: 'Fraction depth lore.',
                primaryKeys: ['middle signal'],
                scanDepth: 1.8,
                insertionOrder: 90,
            }),
            createEntry({
                id: 'entry-negative-depth',
                comment: 'Negative depth',
                content: 'Negative depth lore.',
                primaryKeys: ['recent signal'],
                scanDepth: -1,
                insertionOrder: 80,
            }),
            createEntry({
                id: 'entry-large-depth',
                comment: 'Large depth',
                content: 'Large depth lore.',
                primaryKeys: ['old signal'],
                scanDepth: 5000,
                insertionOrder: 70,
            }),
        ]), {
            defaultScanDepth: 1,
            messages: [
                { content: 'The old signal is archived.', status: 'sent' },
                { content: 'The middle signal is faint.', status: 'sent' },
                { content: 'The recent signal is loud.', status: 'sent' },
            ],
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-large-depth',
        ]);
    });

    it('does not apply scanDepth when explicit scan text is provided', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-scan-text-override',
                comment: 'Scan text override',
                content: 'Scan text override lore.',
                primaryKeys: ['override signal'],
                scanDepth: 0,
            }),
        ]), {
            messages: [
                { content: 'No matching history.', status: 'sent' },
            ],
            scanText: 'override signal',
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-scan-text-override',
        ]);
    });

    it('matches entry opt-in keys against global scan sources', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-persona',
                comment: 'Persona source',
                content: 'Persona lore.',
                primaryKeys: ['pilot alias'],
                matchPersonaDescription: true,
                insertionOrder: 110,
            }),
            createEntry({
                id: 'entry-character-description',
                comment: 'Character description source',
                content: 'Character description lore.',
                primaryKeys: ['silver jacket'],
                matchCharacterDescription: true,
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-character-personality',
                comment: 'Character personality source',
                content: 'Character personality lore.',
                primaryKeys: ['careful optimist'],
                matchCharacterPersonality: true,
                insertionOrder: 90,
            }),
            createEntry({
                id: 'entry-depth-prompt',
                comment: 'Depth prompt source',
                content: 'Depth prompt lore.',
                primaryKeys: ['hidden engine room'],
                matchCharacterDepthPrompt: true,
                insertionOrder: 80,
            }),
            createEntry({
                id: 'entry-scenario',
                comment: 'Scenario source',
                content: 'Scenario lore.',
                primaryKeys: ['orbital market'],
                matchScenario: true,
                insertionOrder: 70,
            }),
            createEntry({
                id: 'entry-creator-notes',
                comment: 'Creator notes source',
                content: 'Creator notes lore.',
                primaryKeys: ['ancient oath'],
                matchCreatorNotes: true,
                insertionOrder: 60,
            }),
            createEntry({
                id: 'entry-without-source-flag',
                comment: 'No source flag',
                content: 'No source flag lore.',
                primaryKeys: ['pilot alias'],
                insertionOrder: 50,
            }),
        ]), {
            scanSources: {
                personaDescription: 'The user is known by the pilot alias.',
                characterDescription: 'The captain wears a silver jacket.',
                characterPersonality: 'A careful optimist under pressure.',
                characterDepthPrompt: 'Mention the hidden engine room at depth.',
                scenario: 'The crew waits at an orbital market.',
                creatorNotes: 'The character keeps an ancient oath secret.',
            },
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-persona',
            'entry-character-description',
            'entry-character-personality',
            'entry-depth-prompt',
            'entry-scenario',
            'entry-creator-notes',
        ]);
    });

    it('does not match global scan sources when corresponding entry flags are off', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-no-source-flag',
                comment: 'No source flag',
                content: 'No source flag lore.',
                primaryKeys: ['persona marker'],
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-wrong-source-flag',
                comment: 'Wrong source flag',
                content: 'Wrong source flag lore.',
                primaryKeys: ['persona marker'],
                matchScenario: true,
                insertionOrder: 90,
            }),
            createEntry({
                id: 'entry-empty-source',
                comment: 'Empty source',
                content: 'Empty source lore.',
                primaryKeys: ['empty marker'],
                matchPersonaDescription: true,
                insertionOrder: 80,
            }),
            createEntry({
                id: 'entry-chat-baseline',
                comment: 'Chat baseline',
                content: 'Chat baseline lore.',
                primaryKeys: ['history marker'],
                insertionOrder: 70,
            }),
        ]), {
            messages: [
                { content: 'The history marker remains in chat.', status: 'sent' },
            ],
            scanSources: {
                personaDescription: 'The persona marker is only in persona data.',
                scenario: '   ',
            },
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-chat-baseline',
        ]);
    });

    it('uses global scan sources for selective secondary keys', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-secondary-from-source',
                comment: 'Secondary from source',
                content: 'Secondary from source lore.',
                primaryKeys: ['primary route'],
                secondaryKeys: ['careful optimist'],
                selective: true,
                matchCharacterPersonality: true,
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-secondary-source-flag-off',
                comment: 'Secondary source flag off',
                content: 'Secondary source flag off lore.',
                primaryKeys: ['primary route'],
                secondaryKeys: ['careful optimist'],
                selective: true,
                insertionOrder: 90,
            }),
        ]), {
            nextMessage: 'Follow the primary route.',
            scanSources: {
                characterPersonality: 'A careful optimist under pressure.',
            },
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-secondary-from-source',
        ]);
    });

    it('keeps global scan sources independent from per-entry history scanDepth', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-source-inside-depth',
                comment: 'Source inside depth',
                content: 'Source inside depth lore.',
                primaryKeys: ['persona marker'],
                scanDepth: 1,
                matchPersonaDescription: true,
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-history-outside-depth',
                comment: 'History outside depth',
                content: 'History outside depth lore.',
                primaryKeys: ['history marker'],
                scanDepth: 1,
                insertionOrder: 90,
            }),
        ]), {
            messages: [
                { content: 'The history marker is only in older chat.', status: 'sent' },
                { content: 'The recent chat marker does not match.', status: 'sent' },
            ],
            scanSources: {
                personaDescription: 'The persona marker is outside chat history.',
            },
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-source-inside-depth',
        ]);
    });

    it('returns no non-override scan haystack when scanDepth resolves to zero even if global sources are enabled', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-source-with-zero-depth',
                comment: 'Source with zero depth',
                content: 'Source with zero depth lore.',
                primaryKeys: ['persona marker'],
                scanDepth: 0,
                matchPersonaDescription: true,
                insertionOrder: 100,
            }),
        ]), {
            scanSources: {
                personaDescription: 'The persona marker is outside chat history.',
            },
        }).entries.map((entry) => entry.id)).toEqual([]);
    });

    it('does not apply global scan sources when explicit scan text is provided', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-from-override',
                comment: 'Override source',
                content: 'Override source lore.',
                primaryKeys: ['override marker'],
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-from-global-source',
                comment: 'Global source',
                content: 'Global source lore.',
                primaryKeys: ['persona marker'],
                matchPersonaDescription: true,
                insertionOrder: 90,
            }),
        ]), {
            scanText: 'The override marker wins.',
            scanSources: {
                personaDescription: 'The persona marker is ignored by explicit scan text.',
            },
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-from-override',
        ]);
    });

    it('matches primary and secondary keys against scan injects', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-from-inject-primary',
                comment: 'Inject primary',
                content: 'Inject primary lore.',
                primaryKeys: ['memory shard'],
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-from-inject-secondary',
                comment: 'Inject secondary',
                content: 'Inject secondary lore.',
                primaryKeys: ['primary route'],
                secondaryKeys: ['authors note marker'],
                selective: true,
                insertionOrder: 90,
            }),
            createEntry({
                id: 'entry-blank-inject',
                comment: 'Blank inject',
                content: 'Blank inject lore.',
                primaryKeys: ['blank marker'],
                insertionOrder: 80,
            }),
        ]), {
            nextMessage: 'Follow the primary route.',
            scanInjects: [
                'The memory shard is available.',
                '   ',
                'Authors note marker is active.',
            ],
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-from-inject-primary',
            'entry-from-inject-secondary',
        ]);
    });

    it('appends scan injects before recursive content during recursive scans', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-seed',
                comment: 'Seed',
                content: 'Recursive content points at late marker.',
                primaryKeys: ['primary route'],
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-from-inject-and-recursion',
                comment: 'Inject and recursion',
                content: 'Inject and recursion lore.',
                primaryKeys: ['/inject marker[\\s\\S]*late marker/i'],
                insertionOrder: 90,
            }),
        ]), {
            messages: [
                { content: 'The primary route is active.', status: 'sent' },
            ],
            recursive: true,
            scanInjects: [
                'Inject marker is in a scanned extension prompt.',
            ],
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-seed',
            'entry-from-inject-and-recursion',
        ]);
    });

    it('keeps scan injects independent from normal recursive chaining', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-from-inject',
                comment: 'Inject source',
                content: 'Inject source lore.',
                primaryKeys: ['inject marker'],
            }),
        ]), {
            scanInjects: [
                'Inject marker is available without recursive scanning.',
            ],
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-from-inject',
        ]);
    });

    it('returns no non-override scan haystack when scanDepth resolves to zero even if scan injects are provided', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-inject-zero-depth',
                comment: 'Inject zero depth',
                content: 'Inject zero depth lore.',
                primaryKeys: ['inject marker'],
                scanDepth: 0,
            }),
        ]), {
            scanInjects: [
                'Inject marker is blocked by zero scan depth.',
            ],
        }).entries.map((entry) => entry.id)).toEqual([]);
    });

    it('does not apply scan injects when explicit scan text is provided', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-from-override',
                comment: 'Override source',
                content: 'Override source lore.',
                primaryKeys: ['override marker'],
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-from-inject',
                comment: 'Inject source',
                content: 'Inject source lore.',
                primaryKeys: ['inject marker'],
                insertionOrder: 90,
            }),
        ]), {
            scanText: 'The override marker wins.',
            scanInjects: [
                'The inject marker is ignored by explicit scan text.',
            ],
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-from-override',
        ]);
    });

    it('recursively activates entries from successful entry content when enabled', () => {
        const libraryItem = createLibraryItem([
            createEntry({
                id: 'entry-seed',
                comment: 'Seed',
                content: 'The relay mentions a recursive beacon.',
                primaryKeys: ['primary route'],
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-recursive',
                comment: 'Recursive',
                content: 'Recursive beacon lore.',
                primaryKeys: ['recursive beacon'],
                insertionOrder: 90,
            }),
        ]);

        expect(createChatLorebookContext(libraryItem, {
            scanText: 'The primary route is active.',
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-seed',
        ]);

        expect(createChatLorebookContext(libraryItem, {
            messages: [
                { content: 'The primary route is active.', status: 'sent' },
            ],
            recursive: true,
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-seed',
            'entry-recursive',
        ]);
    });

    it('feeds macro-substituted entry content into recursive scans', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-seed',
                comment: 'Seed',
                content: 'The relay mentions {{childKey}}.',
                primaryKeys: ['primary route'],
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-recursive',
                comment: 'Recursive',
                content: 'Recursive macro lore.',
                primaryKeys: ['recursive beacon'],
                insertionOrder: 90,
            }),
        ]), {
            macroValues: {
                childKey: 'recursive beacon',
            },
            messages: [
                { content: 'The primary route is active.', status: 'sent' },
            ],
            recursive: true,
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-seed',
            'entry-recursive',
        ]);
    });

    it('does not recurse through entries that fail probability or prevent recursion', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-probability-fail',
                comment: 'Probability fail',
                content: 'The failed branch contains a hidden branch.',
                primaryKeys: ['primary route'],
                probability: 0,
                useProbability: true,
                insertionOrder: 120,
            }),
            createEntry({
                id: 'entry-prevent-recursion',
                comment: 'Prevent recursion',
                content: 'The prevented branch contains a sealed branch.',
                primaryKeys: ['primary route'],
                preventRecursion: true,
                insertionOrder: 110,
            }),
            createEntry({
                id: 'entry-normal-recursion',
                comment: 'Normal recursion',
                content: 'The normal branch contains an open branch.',
                primaryKeys: ['primary route'],
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-hidden-child',
                comment: 'Hidden child',
                content: 'Hidden child lore.',
                primaryKeys: ['hidden branch'],
                insertionOrder: 90,
            }),
            createEntry({
                id: 'entry-sealed-child',
                comment: 'Sealed child',
                content: 'Sealed child lore.',
                primaryKeys: ['sealed branch'],
                insertionOrder: 80,
            }),
            createEntry({
                id: 'entry-open-child',
                comment: 'Open child',
                content: 'Open child lore.',
                primaryKeys: ['open branch'],
                insertionOrder: 70,
            }),
        ]), {
            messages: [
                { content: 'The primary route is active.', status: 'sent' },
            ],
            random: () => 1,
            recursive: true,
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-prevent-recursion',
            'entry-normal-recursion',
            'entry-open-child',
        ]);
    });

    it('suppresses exclude-recursion entries during recursive scans', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-seed',
                comment: 'Seed',
                content: 'The seed exposes a recursion-only marker.',
                primaryKeys: ['primary route'],
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-excluded-recursion',
                comment: 'Excluded recursion',
                content: 'Excluded recursion lore.',
                primaryKeys: ['recursion-only marker'],
                excludeRecursion: true,
                insertionOrder: 90,
            }),
            createEntry({
                id: 'entry-allowed-recursion',
                comment: 'Allowed recursion',
                content: 'Allowed recursion lore.',
                primaryKeys: ['recursion-only marker'],
                insertionOrder: 80,
            }),
        ]), {
            messages: [
                { content: 'The primary route is active.', status: 'sent' },
            ],
            recursive: true,
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-seed',
            'entry-allowed-recursion',
        ]);
    });

    it('allows exclude-recursion entries during the initial scan', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-initial-excluded-recursion',
                comment: 'Initial excluded recursion',
                content: 'Initial excluded recursion lore.',
                primaryKeys: ['primary route'],
                excludeRecursion: true,
            }),
        ]), {
            messages: [
                { content: 'The primary route is active.', status: 'sent' },
            ],
            recursive: true,
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-initial-excluded-recursion',
        ]);
    });

    it('delays entries until recursion reaches their configured level', () => {
        const libraryItem = createLibraryItem([
            createEntry({
                id: 'entry-seed-level-one',
                comment: 'Seed level one',
                content: 'Level one opens level-two marker.',
                primaryKeys: ['primary route'],
                insertionOrder: 120,
            }),
            createEntry({
                id: 'entry-delay-one',
                comment: 'Delay one',
                content: 'Delay one lore.',
                primaryKeys: ['primary route'],
                delayUntilRecursion: true,
                insertionOrder: 110,
            }),
            createEntry({
                id: 'entry-delay-two',
                comment: 'Delay two',
                content: 'Delay two lore.',
                primaryKeys: ['level-two marker'],
                delayUntilRecursion: 2,
                insertionOrder: 100,
            }),
        ]);

        expect(createChatLorebookContext(libraryItem, {
            messages: [
                { content: 'The primary route is active.', status: 'sent' },
            ],
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-seed-level-one',
            'entry-delay-one',
            'entry-delay-two',
        ]);

        expect(createChatLorebookContext(libraryItem, {
            messages: [
                { content: 'The primary route is active.', status: 'sent' },
            ],
            recursive: true,
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-seed-level-one',
            'entry-delay-one',
            'entry-delay-two',
        ]);
    });

    it('does not run a lone delayed recursion level without normal recursion', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-delayed',
                comment: 'Delayed',
                content: 'Delayed lore.',
                primaryKeys: ['primary route'],
                delayUntilRecursion: true,
            }),
        ]), {
            messages: [
                { content: 'The primary route is active.', status: 'sent' },
            ],
        }).entries.map((entry) => entry.id)).toEqual([]);
    });

    it('respects maxRecursionSteps using SillyTavern loop-count semantics', () => {
        const libraryItem = createLibraryItem([
            createEntry({
                id: 'entry-seed',
                comment: 'Seed',
                content: 'The seed exposes marker two.',
                primaryKeys: ['marker one'],
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-second',
                comment: 'Second',
                content: 'The second entry exposes marker three.',
                primaryKeys: ['marker two'],
                insertionOrder: 90,
            }),
            createEntry({
                id: 'entry-third',
                comment: 'Third',
                content: 'Third lore.',
                primaryKeys: ['marker three'],
                insertionOrder: 80,
            }),
        ]);

        expect(createChatLorebookContext(libraryItem, {
            messages: [
                { content: 'The scan starts with marker one.', status: 'sent' },
            ],
            maxRecursionSteps: 2,
            recursive: true,
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-seed',
            'entry-second',
        ]);

        expect(createChatLorebookContext(libraryItem, {
            messages: [
                { content: 'The scan starts with marker one.', status: 'sent' },
            ],
            recursive: true,
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-seed',
            'entry-second',
            'entry-third',
        ]);
    });

    it('advances default scan depth until minimum activations are satisfied', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-older',
                comment: 'Older marker',
                content: 'Older marker lore.',
                primaryKeys: ['older marker'],
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-recent',
                comment: 'Recent marker',
                content: 'Recent marker lore.',
                primaryKeys: ['recent marker'],
                insertionOrder: 90,
            }),
        ]), {
            defaultScanDepth: 1,
            messages: [
                { content: 'The older marker was mentioned first.', status: 'sent' },
                { content: 'The recent marker is visible now.', status: 'sent' },
            ],
            minimumActivations: 2,
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-older',
            'entry-recent',
        ]);
    });

    it('stops minimum activation scans at the configured depth max', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-oldest',
                comment: 'Oldest marker',
                content: 'Oldest marker lore.',
                primaryKeys: ['oldest marker'],
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-middle',
                comment: 'Middle marker',
                content: 'Middle marker lore.',
                primaryKeys: ['middle marker'],
                insertionOrder: 90,
            }),
            createEntry({
                id: 'entry-recent',
                comment: 'Recent marker',
                content: 'Recent marker lore.',
                primaryKeys: ['recent marker'],
                insertionOrder: 80,
            }),
        ]), {
            defaultScanDepth: 1,
            messages: [
                { content: 'The oldest marker is too far back.', status: 'sent' },
                { content: 'The middle marker is just outside the initial scan.', status: 'sent' },
                { content: 'The recent marker is inside the initial scan.', status: 'sent' },
            ],
            minimumActivations: 3,
            minimumActivationsDepthMax: 1,
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-middle',
            'entry-recent',
        ]);
    });

    it('keeps entry scanDepth independent from minimum activation depth skew', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-entry-depth',
                comment: 'Entry depth',
                content: 'Entry depth lore.',
                primaryKeys: ['older marker'],
                scanDepth: 1,
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-default-depth',
                comment: 'Default depth',
                content: 'Default depth lore.',
                primaryKeys: ['older marker'],
                insertionOrder: 90,
            }),
            createEntry({
                id: 'entry-recent',
                comment: 'Recent marker',
                content: 'Recent marker lore.',
                primaryKeys: ['recent marker'],
                insertionOrder: 80,
            }),
        ]), {
            defaultScanDepth: 1,
            messages: [
                { content: 'The older marker was mentioned first.', status: 'sent' },
                { content: 'The recent marker is visible now.', status: 'sent' },
            ],
            minimumActivations: 2,
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-default-depth',
            'entry-recent',
        ]);
    });

    it('runs recursion after minimum activation scans without mixing recursion text into the min-activation haystack', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-seed',
                comment: 'Seed',
                content: 'The seed exposes a recursive marker.',
                primaryKeys: ['primary route'],
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-combined-recursion',
                comment: 'Combined recursion',
                content: 'Combined recursion lore.',
                primaryKeys: ['/older marker[\\s\\S]*recursive marker/i'],
                insertionOrder: 90,
            }),
        ]), {
            defaultScanDepth: 1,
            messages: [
                { content: 'The older marker is outside the initial scan.', status: 'sent' },
                { content: 'The primary route is active.', status: 'sent' },
            ],
            minimumActivations: 2,
            recursive: true,
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-seed',
            'entry-combined-recursion',
        ]);
    });

    it('prevents later recursion scans from activating another entry in an already activated inclusion group', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-group-winner',
                comment: 'Group winner',
                content: 'The winning route exposes a recursive marker.',
                primaryKeys: ['primary route'],
                group: 'route-group',
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-recursive-loser',
                comment: 'Recursive loser',
                content: 'Recursive loser lore.',
                primaryKeys: ['recursive marker'],
                group: 'route-group',
                insertionOrder: 90,
            }),
        ]), {
            messages: [
                { content: 'The primary route is active.', status: 'sent' },
            ],
            recursive: true,
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-group-winner',
        ]);
    });

    it('does not lock an inclusion group when its earlier candidate fails probability', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-recursion-seed',
                comment: 'Recursion seed',
                content: 'The seed exposes a recursive marker.',
                primaryKeys: ['primary route'],
                insertionOrder: 110,
            }),
            createEntry({
                id: 'entry-probability-loser',
                comment: 'Probability loser',
                content: 'Probability loser lore.',
                primaryKeys: ['primary route'],
                group: 'route-group',
                probability: 0,
                useProbability: true,
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-recursive-winner',
                comment: 'Recursive winner',
                content: 'Recursive winner lore.',
                primaryKeys: ['recursive marker'],
                group: 'route-group',
                insertionOrder: 90,
            }),
        ]), {
            messages: [
                { content: 'The primary route is active.', status: 'sent' },
            ],
            random: () => 1,
            recursive: true,
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-recursion-seed',
            'entry-recursive-winner',
        ]);
    });

    it('matches SillyTavern raw group equality for cross-loop comma-group locks', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-comma-group-winner',
                comment: 'Comma group winner',
                content: 'The comma group exposes a recursive marker.',
                primaryKeys: ['primary route'],
                group: 'alpha, beta',
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-alpha-recursive',
                comment: 'Alpha recursive',
                content: 'Alpha recursive lore.',
                primaryKeys: ['recursive marker'],
                group: 'alpha',
                insertionOrder: 90,
            }),
        ]), {
            messages: [
                { content: 'The primary route is active.', status: 'sent' },
            ],
            recursive: true,
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-comma-group-winner',
            'entry-alpha-recursive',
        ]);
    });

    it('locks later comma-group entries when a previous single raw group matches one parsed group name', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-alpha-winner',
                comment: 'Alpha winner',
                content: 'The alpha group exposes a recursive marker.',
                primaryKeys: ['primary route'],
                group: 'alpha',
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-comma-recursive',
                comment: 'Comma recursive',
                content: 'Comma recursive lore.',
                primaryKeys: ['recursive marker'],
                group: 'alpha, beta',
                insertionOrder: 90,
            }),
        ]), {
            messages: [
                { content: 'The primary route is active.', status: 'sent' },
            ],
            recursive: true,
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-alpha-winner',
        ]);
    });

    it('applies activated inclusion group state during minimum activation scans', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-recent-winner',
                comment: 'Recent winner',
                content: 'Recent winner lore.',
                primaryKeys: ['recent marker'],
                group: 'route-group',
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-min-activation-loser',
                comment: 'Min activation loser',
                content: 'Min activation loser lore.',
                primaryKeys: ['older marker'],
                group: 'route-group',
                insertionOrder: 90,
            }),
        ]), {
            defaultScanDepth: 1,
            messages: [
                { content: 'The older marker is outside the initial scan.', status: 'sent' },
                { content: 'The recent marker is inside the initial scan.', status: 'sent' },
            ],
            minimumActivations: 2,
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-recent-winner',
        ]);
    });

    it('applies activated inclusion group state during delayed recursion scans', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-initial-winner',
                comment: 'Initial winner',
                content: 'Initial winner lore.',
                primaryKeys: ['primary route'],
                group: 'route-group',
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-delayed-loser',
                comment: 'Delayed loser',
                content: 'Delayed loser lore.',
                primaryKeys: ['primary route'],
                group: 'route-group',
                delayUntilRecursion: true,
                insertionOrder: 90,
            }),
        ]), {
            messages: [
                { content: 'The primary route is active.', status: 'sent' },
            ],
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-initial-winner',
        ]);
    });

    it('limits activated entries with the same inclusive token-budget threshold as SillyTavern', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-first',
                comment: 'First',
                content: 'one',
                primaryKeys: ['primary route'],
                insertionOrder: 120,
            }),
            createEntry({
                id: 'entry-overflow',
                comment: 'Overflow',
                content: 'two',
                primaryKeys: ['primary route'],
                insertionOrder: 110,
            }),
            createEntry({
                id: 'entry-after-overflow',
                comment: 'After overflow',
                content: 'three',
                primaryKeys: ['primary route'],
                insertionOrder: 100,
            }),
        ]), {
            messages: [
                { content: 'The primary route is active.', status: 'sent' },
            ],
            tokenBudget: 2,
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-first',
        ]);
    });

    it('counts macro-substituted content against the token budget', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-overflow',
                comment: 'Overflow',
                content: '{{long}}',
                primaryKeys: ['primary route'],
                insertionOrder: 120,
            }),
            createEntry({
                id: 'entry-after-overflow',
                comment: 'After overflow',
                content: 'after',
                primaryKeys: ['primary route'],
                insertionOrder: 110,
            }),
        ]), {
            macroValues: {
                long: 'one two',
            },
            messages: [
                { content: 'The primary route is active.', status: 'sent' },
            ],
            tokenBudget: 2,
        }).entries.map((entry) => entry.id)).toEqual([]);
    });

    it('derives token budgets from context size, percentage, and cap using SillyTavern defaults', () => {
        const libraryItem = createLibraryItem([
            createEntry({
                id: 'entry-first',
                comment: 'First',
                content: 'one',
                primaryKeys: ['primary route'],
                insertionOrder: 120,
            }),
            createEntry({
                id: 'entry-second',
                comment: 'Second',
                content: 'two',
                primaryKeys: ['primary route'],
                insertionOrder: 110,
            }),
            createEntry({
                id: 'entry-third',
                comment: 'Third',
                content: 'three',
                primaryKeys: ['primary route'],
                insertionOrder: 100,
            }),
        ]);

        expect(createChatLorebookContext(libraryItem, {
            contextTokenLimit: 100,
            messages: [
                { content: 'The primary route is active.', status: 'sent' },
            ],
            tokenBudgetCap: 2,
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-first',
        ]);

        expect(createChatLorebookContext(libraryItem, {
            contextTokenLimit: 100,
            messages: [
                { content: 'The primary route is active.', status: 'sent' },
            ],
            tokenBudgetCap: 0,
            tokenBudgetPercent: 25,
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-first',
            'entry-second',
            'entry-third',
        ]);

        expect(createChatLorebookContext(libraryItem, {
            contextTokenLimit: 100,
            messages: [
                { content: 'The primary route is active.', status: 'sent' },
            ],
            tokenBudgetPercent: 0,
        }).entries.map((entry) => entry.id)).toEqual([]);
    });

    it('lets ignore-budget entries activate while their content still affects later ordinary entries', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-ignore-budget',
                comment: 'Ignore budget',
                content: 'free lore',
                ignoreBudget: true,
                primaryKeys: ['primary route'],
                insertionOrder: 120,
            }),
            createEntry({
                id: 'entry-ordinary-overflow',
                comment: 'Ordinary overflow',
                content: 'ordinary',
                primaryKeys: ['primary route'],
                insertionOrder: 110,
            }),
        ]), {
            messages: [
                { content: 'The primary route is active.', status: 'sent' },
            ],
            tokenBudget: 3,
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-ignore-budget',
        ]);
    });

    it('continues past overflowed ordinary entries to keep later ignore-budget entries', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-overflows',
                comment: 'Overflows',
                content: 'one two',
                primaryKeys: ['primary route'],
                insertionOrder: 120,
            }),
            createEntry({
                id: 'entry-skipped-after-overflow',
                comment: 'Skipped after overflow',
                content: 'ordinary',
                primaryKeys: ['primary route'],
                insertionOrder: 110,
            }),
            createEntry({
                id: 'entry-ignore-after-overflow',
                comment: 'Ignore after overflow',
                content: 'ignored',
                ignoreBudget: true,
                primaryKeys: ['primary route'],
                insertionOrder: 100,
            }),
        ]), {
            messages: [
                { content: 'The primary route is active.', status: 'sent' },
            ],
            tokenBudget: 2,
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-ignore-after-overflow',
        ]);
    });

    it('does not apply token budgets while previewing inactive entries', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-preview-first',
                comment: 'Preview first',
                content: 'one',
                primaryKeys: ['primary route'],
                insertionOrder: 120,
            }),
            createEntry({
                id: 'entry-preview-second',
                comment: 'Preview second',
                content: 'two',
                primaryKeys: ['primary route'],
                insertionOrder: 110,
            }),
        ]), {
            countTokens: () => {
                throw new Error('Preview should not count lore budget tokens.');
            },
            includeInactivePreviewEntries: true,
            tokenBudget: 1,
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-preview-first',
            'entry-preview-second',
        ]);
    });

    it('stops recursive and minimum-activation scans after token-budget overflow', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-seed',
                comment: 'Seed',
                content: 'recursive-marker',
                primaryKeys: ['recent marker'],
                insertionOrder: 120,
            }),
            createEntry({
                id: 'entry-overflow',
                comment: 'Overflow',
                content: 'overflow',
                primaryKeys: ['recent marker'],
                insertionOrder: 110,
            }),
            createEntry({
                id: 'entry-recursive-child',
                comment: 'Recursive child',
                content: 'Recursive child lore.',
                primaryKeys: ['recursive-marker'],
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-older-min-activation',
                comment: 'Older min activation',
                content: 'Older min activation lore.',
                primaryKeys: ['older marker'],
                insertionOrder: 90,
            }),
        ]), {
            defaultScanDepth: 1,
            messages: [
                { content: 'The older marker is outside the initial scan.', status: 'sent' },
                { content: 'The recent marker is active.', status: 'sent' },
            ],
            minimumActivations: 3,
            recursive: true,
            tokenBudget: 2,
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-seed',
        ]);
    });

    it('routes activated entries into SillyTavern-style prompt buckets', () => {
        const context = createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-before-high',
                comment: 'Before high',
                content: 'Before high lore.',
                constant: true,
                insertionOrder: 120,
                position: 'before',
            }),
            createEntry({
                id: 'entry-before-low',
                comment: 'Before low',
                content: 'Before low lore.',
                constant: true,
                insertionOrder: 80,
                position: 'before',
            }),
            createEntry({
                id: 'entry-after',
                comment: 'After',
                content: 'After lore.',
                constant: true,
                insertionOrder: 110,
                position: 'after',
            }),
            createEntry({
                id: 'entry-author-before',
                comment: 'Author before',
                content: 'Author before lore.',
                constant: true,
                insertionOrder: 100,
                position: 'author-note-top',
            }),
            createEntry({
                id: 'entry-author-after',
                comment: 'Author after',
                content: 'Author after lore.',
                constant: true,
                insertionOrder: 90,
                position: 'author-note-bottom',
            }),
            createEntry({
                id: 'entry-example-before',
                comment: 'Example before',
                content: 'Example before lore.',
                constant: true,
                insertionOrder: 70,
                position: 'examples-top',
            }),
            createEntry({
                id: 'entry-example-after',
                comment: 'Example after',
                content: 'Example after lore.',
                constant: true,
                insertionOrder: 60,
                position: 'examples-bottom',
            }),
        ]));

        expect(context.entries.map((entry) => entry.id)).toEqual([
            'entry-before-high',
            'entry-after',
            'entry-author-before',
            'entry-author-after',
            'entry-before-low',
            'entry-example-before',
            'entry-example-after',
        ]);
        expect(context.beforeEntries?.map((entry) => entry.id)).toEqual([
            'entry-before-low',
            'entry-before-high',
        ]);
        expect(context.afterEntries?.map((entry) => entry.id)).toEqual([
            'entry-after',
        ]);
        expect(context.authorNoteBeforeEntries?.map((entry) => entry.id)).toEqual([
            'entry-author-before',
        ]);
        expect(context.authorNoteAfterEntries?.map((entry) => entry.id)).toEqual([
            'entry-author-after',
        ]);
        expect(context.exampleEntries).toEqual([
            {
                position: 'after',
                content: 'Example after lore.',
                sourceEntryId: 'entry-example-after',
                title: 'Example after',
            },
            {
                position: 'before',
                content: 'Example before lore.',
                sourceEntryId: 'entry-example-before',
                title: 'Example before',
            },
        ]);
    });

    it('groups at-depth entries by normalized depth and role', () => {
        const context = createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-depth-system-high',
                comment: 'Depth system high',
                content: 'Depth system high lore.',
                constant: true,
                depth: 6,
                insertionOrder: 120,
                position: 'at-depth',
                role: 0,
            }),
            createEntry({
                id: 'entry-depth-user',
                comment: 'Depth user',
                content: 'Depth user lore.',
                constant: true,
                depth: 6,
                insertionOrder: 110,
                position: 'at-depth',
                role: 1,
            }),
            createEntry({
                id: 'entry-depth-system-low',
                comment: 'Depth system low',
                content: 'Depth system low lore.',
                constant: true,
                depth: 6,
                insertionOrder: 100,
                position: 'at-depth',
                role: 'system',
            }),
            createEntry({
                id: 'entry-depth-default',
                comment: 'Depth default',
                content: 'Depth default lore.',
                constant: true,
                insertionOrder: 90,
                position: 'at-depth',
                role: null,
            }),
        ]));

        expect(context.depthEntries).toEqual([
            {
                depth: 6,
                role: 'system',
                entries: [
                    {
                        id: 'entry-depth-system-low',
                        title: 'Depth system low',
                        content: 'Depth system low lore.',
                    },
                    {
                        id: 'entry-depth-system-high',
                        title: 'Depth system high',
                        content: 'Depth system high lore.',
                    },
                ],
            },
            {
                depth: 6,
                role: 'user',
                entries: [
                    {
                        id: 'entry-depth-user',
                        title: 'Depth user',
                        content: 'Depth user lore.',
                    },
                ],
            },
            {
                depth: 4,
                role: 'system',
                entries: [
                    {
                        id: 'entry-depth-default',
                        title: 'Depth default',
                        content: 'Depth default lore.',
                    },
                ],
            },
        ]);
    });

    it('routes outlet entries by name and keeps SillyTavern descending order', () => {
        const context = createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-outlet-high',
                comment: 'Outlet high',
                content: 'Outlet high lore.',
                constant: true,
                insertionOrder: 120,
                outletName: 'navigation',
                position: 'outlet',
            }),
            createEntry({
                id: 'entry-outlet-low',
                comment: 'Outlet low',
                content: 'Outlet low lore.',
                constant: true,
                insertionOrder: 80,
                outletName: 'navigation',
                position: 'outlet',
            }),
            createEntry({
                id: 'entry-outlet-empty',
                comment: 'Outlet empty',
                content: 'Outlet empty lore.',
                constant: true,
                insertionOrder: 70,
                outletName: '',
                position: 'outlet',
            }),
            createEntry({
                id: 'entry-outlet-other',
                comment: 'Outlet other',
                content: 'Outlet other lore.',
                constant: true,
                insertionOrder: 60,
                outletName: 'signals',
                position: 'outlet',
            }),
        ]));

        expect(context.outletEntries).toEqual({
            navigation: [
                {
                    id: 'entry-outlet-high',
                    title: 'Outlet high',
                    content: 'Outlet high lore.',
                },
                {
                    id: 'entry-outlet-low',
                    title: 'Outlet low',
                    content: 'Outlet low lore.',
                },
            ],
            signals: [
                {
                    id: 'entry-outlet-other',
                    title: 'Outlet other',
                    content: 'Outlet other lore.',
                },
            ],
        });
    });

    it('suppresses delayed timed-effect entries until enough scan chunks are available', () => {
        const libraryItem = createLibraryItem([
            createEntry({
                id: 'entry-delayed',
                comment: 'Delayed timed effect',
                content: 'Delayed timed-effect lore.',
                primaryKeys: ['primary route'],
                delay: 3,
            }),
        ]);

        expect(createChatLorebookContext(libraryItem, {
            messages: [
                { content: 'The primary route is active.', status: 'sent' },
                { content: 'The primary route is still active.', status: 'sent' },
            ],
        }).entries.map((entry) => entry.id)).toEqual([]);

        expect(createChatLorebookContext(libraryItem, {
            messages: [
                { content: 'The primary route is active.', status: 'sent' },
                { content: 'The primary route is still active.', status: 'sent' },
                { content: 'The primary route has enough history.', status: 'sent' },
            ],
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-delayed',
        ]);
    });

    it('suppresses active cooldown entries unless they are also sticky', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-cooldown',
                comment: 'Cooldown',
                content: 'Cooldown lore.',
                constant: true,
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-cooldown-sticky',
                comment: 'Cooldown sticky',
                content: 'Cooldown sticky lore.',
                constant: true,
                insertionOrder: 90,
            }),
        ]), {
            timedEffects: {
                cooldownEntryIds: ['entry-cooldown', 'entry-cooldown-sticky'],
                stickyEntryIds: ['entry-cooldown-sticky'],
            },
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-cooldown-sticky',
        ]);
    });

    it('activates sticky entries without keys and skips probability rerolls', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-sticky',
                comment: 'Sticky',
                content: 'Sticky lore.',
                probability: 0,
                useProbability: true,
            }),
        ]), {
            random: () => {
                throw new Error('Sticky entries should not roll probability.');
            },
            timedEffects: {
                stickyEntryIds: ['entry-sticky'],
            },
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-sticky',
        ]);
    });

    it('forces sticky inclusion-group entries to win without weighted random selection', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-non-sticky-group',
                comment: 'Non sticky group',
                content: 'Non sticky group lore.',
                primaryKeys: ['primary route'],
                group: 'sticky-group',
                groupWeight: 100,
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-sticky-group',
                comment: 'Sticky group',
                content: 'Sticky group lore.',
                group: 'sticky-group',
                groupWeight: 0,
                insertionOrder: 90,
            }),
        ]), {
            messages: [
                { content: 'The primary route is active.', status: 'sent' },
            ],
            random: () => {
                throw new Error('Sticky groups should not roll weighted random.');
            },
            timedEffects: {
                stickyEntryIds: ['entry-sticky-group'],
            },
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-sticky-group',
        ]);
    });

    it('keeps multiple sticky entries in the same inclusion group', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-sticky-first',
                comment: 'Sticky first',
                content: 'Sticky first lore.',
                group: 'sticky-group',
                insertionOrder: 100,
            }),
            createEntry({
                id: 'entry-sticky-second',
                comment: 'Sticky second',
                content: 'Sticky second lore.',
                group: 'sticky-group',
                insertionOrder: 90,
            }),
            createEntry({
                id: 'entry-non-sticky',
                comment: 'Non sticky',
                content: 'Non sticky lore.',
                primaryKeys: ['primary route'],
                group: 'sticky-group',
                insertionOrder: 80,
            }),
        ]), {
            messages: [
                { content: 'The primary route is active.', status: 'sent' },
            ],
            random: () => {
                throw new Error('Sticky groups should not roll weighted random.');
            },
            timedEffects: {
                stickyEntryIds: ['entry-sticky-first', 'entry-sticky-second'],
            },
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-sticky-first',
            'entry-sticky-second',
        ]);
    });

    it('lets sticky entries bypass delay-until-recursion gating', () => {
        expect(createChatLorebookContext(createLibraryItem([
            createEntry({
                id: 'entry-sticky-delay-until-recursion',
                comment: 'Sticky delay until recursion',
                content: 'Sticky delay-until-recursion lore.',
                delayUntilRecursion: true,
            }),
        ]), {
            timedEffects: {
                stickyEntryIds: ['entry-sticky-delay-until-recursion'],
            },
        }).entries.map((entry) => entry.id)).toEqual([
            'entry-sticky-delay-until-recursion',
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

function createRandomSequence(values: number[]): () => number {
    let index = 0;
    return () => values[index++] ?? values.at(-1) ?? 1;
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
