import { describe, expect, it } from 'vitest';
import { parseWorldbookJson, ReforgedWorldbookParseError } from './worldbookJson';

describe('parseWorldbookJson', () => {
    it('normalizes native SillyTavern world info entries and preserves raw fields', () => {
        const rawEntry = {
            uid: 7,
            key: ['nebula', 'chart'],
            keysecondary: ['captain'],
            comment: 'Nebula route',
            content: 'The blue giant distorts local navigation.',
            constant: true,
            selective: true,
            selectiveLogic: 3,
            order: 42,
            displayIndex: 2,
            position: 4,
            role: 0,
            depth: 6,
            scanDepth: 8,
            probability: 65,
            useProbability: false,
            caseSensitive: true,
            matchWholeWords: false,
            useGroupScoring: true,
            vectorized: true,
            addMemo: true,
            disable: true,
            excludeRecursion: true,
            preventRecursion: true,
            delayUntilRecursion: 2,
            ignoreBudget: true,
            group: 'routes',
            groupOverride: true,
            groupWeight: 80,
            outletName: 'navigation',
            automationId: 'auto-route',
            sticky: 3,
            cooldown: 4,
            delay: 5,
            triggers: ['normal'],
            matchPersonaDescription: true,
            matchCharacterDescription: true,
            matchCharacterPersonality: true,
            matchCharacterDepthPrompt: true,
            matchScenario: true,
            matchCreatorNotes: true,
            extensions: {
                customFlag: 'keep me',
            },
        };

        const worldbook = parseWorldbookJson(JSON.stringify({
            name: 'Astra Routes',
            entries: {
                7: rawEntry,
            },
        }));

        expect(worldbook).toMatchObject({
            name: 'Astra Routes',
            source: 'sillytavern-world-info',
            entries: [
                {
                    id: '7',
                    uid: 7,
                    comment: 'Nebula route',
                    content: 'The blue giant distorts local navigation.',
                    primaryKeys: ['nebula', 'chart'],
                    secondaryKeys: ['captain'],
                    enabled: false,
                    constant: true,
                    selective: true,
                    selectiveLogic: 3,
                    insertionOrder: 42,
                    displayIndex: 2,
                    position: 'at-depth',
                    role: 0,
                    depth: 6,
                    scanDepth: 8,
                    probability: 65,
                    useProbability: false,
                    caseSensitive: true,
                    matchWholeWords: false,
                    useGroupScoring: true,
                    vectorized: true,
                    addMemo: true,
                    excludeRecursion: true,
                    preventRecursion: true,
                    delayUntilRecursion: 2,
                    ignoreBudget: true,
                    group: 'routes',
                    groupOverride: true,
                    groupWeight: 80,
                    outletName: 'navigation',
                    automationId: 'auto-route',
                    sticky: 3,
                    cooldown: 4,
                    delay: 5,
                    triggers: ['normal'],
                    matchPersonaDescription: true,
                    matchCharacterDescription: true,
                    matchCharacterPersonality: true,
                    matchCharacterDepthPrompt: true,
                    matchScenario: true,
                    matchCreatorNotes: true,
                    extensionsRaw: {
                        customFlag: 'keep me',
                    },
                    raw: rawEntry,
                },
            ],
        });
    });

    it('normalizes Character Book entries from array shape', () => {
        const worldbook = parseWorldbookJson(JSON.stringify({
            displayName: 'Embedded Lore',
            entries: [
                {
                    id: 'entry-1',
                    keys: ['ward'],
                    secondary_keys: ['library'],
                    comment: 'Archive wards',
                    content: 'The archive answers only polite questions.',
                    enabled: false,
                    constant: true,
                    selective: true,
                    insertion_order: 12,
                    position: 'before_char',
                    extensions: {
                        display_index: 9,
                        depth: 4,
                        scan_depth: 10,
                        probability: 75,
                        case_sensitive: false,
                        match_whole_words: true,
                        use_group_scoring: false,
                        role: 'system',
                        exclude_recursion: true,
                        group_weight: 55,
                        automation_id: 'ward-check',
                        triggers: ['continue'],
                    },
                },
            ],
        }));

        expect(worldbook).toMatchObject({
            name: 'Embedded Lore',
            source: 'character-book',
            entries: [
                {
                    id: 'entry-1',
                    uid: 'entry-1',
                    primaryKeys: ['ward'],
                    secondaryKeys: ['library'],
                    enabled: false,
                    constant: true,
                    selective: true,
                    insertionOrder: 12,
                    displayIndex: 9,
                    position: 'before',
                    role: 'system',
                    depth: 4,
                    scanDepth: 10,
                    probability: 75,
                    caseSensitive: false,
                    matchWholeWords: true,
                    useGroupScoring: false,
                    excludeRecursion: true,
                    groupWeight: 55,
                    automationId: 'ward-check',
                    triggers: ['continue'],
                    extensionsRaw: {
                        display_index: 9,
                        depth: 4,
                        scan_depth: 10,
                        probability: 75,
                        case_sensitive: false,
                        match_whole_words: true,
                        use_group_scoring: false,
                        role: 'system',
                        exclude_recursion: true,
                        group_weight: 55,
                        automation_id: 'ward-check',
                        triggers: ['continue'],
                    },
                },
            ],
        });
    });

    it('throws a typed empty-worldbook error for valid but empty native books', () => {
        expect(() => parseWorldbookJson(JSON.stringify({ entries: {} }))).toThrow(ReforgedWorldbookParseError);

        try {
            parseWorldbookJson(JSON.stringify({ entries: {} }));
        } catch (error) {
            expect(error).toMatchObject({
                code: 'empty-worldbook',
            });
        }
    });
});
