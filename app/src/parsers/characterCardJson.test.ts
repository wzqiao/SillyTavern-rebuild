import { describe, expect, it } from 'vitest';

import { parseCharacterCardJson } from './characterCardJson';

describe('parseCharacterCardJson', () => {
    it('normalizes a V2 card from the data payload', () => {
        const card = parseCharacterCardJson({
            spec: 'chara_card_v2',
            spec_version: '2.0',
            data: {
                name: 'Astra',
                description: 'A navigator from the outer rim.',
                personality: 'Calm and observant.',
                scenario: 'A quiet bridge before hyperspace.',
                first_mes: 'Coordinates locked.',
                alternate_greetings: ['Ready for departure.', 'Charting a new route.'],
                tags: ['space', 'captain'],
                extensions: {
                    world: 'frontier',
                },
            },
        });

        expect(card).toEqual({
            name: 'Astra',
            description: 'A navigator from the outer rim.',
            personality: 'Calm and observant.',
            scenario: 'A quiet bridge before hyperspace.',
            firstMessage: 'Coordinates locked.',
            exampleMessages: '',
            alternateGreetings: ['Ready for departure.', 'Charting a new route.'],
            tags: ['space', 'captain'],
            characterBook: null,
            regexScripts: [],
            extensions: {
                world: 'frontier',
            },
            rawVersion: '2.0',
            source: 'json-v2',
        });
    });

    it('normalizes a V3-like card from a JSON string', () => {
        const card = parseCharacterCardJson(JSON.stringify({
            spec: 'chara_card_v3',
            spec_version: '3.1',
            data: {
                name: 'Mira',
                description: 'An archivist of forbidden songs.',
                personality: 'Measured, curious, and kind.',
                scenario: 'A sealed library after dusk.',
                firstMessage: 'You made it past the wards.',
                exampleMessages: '',
                alternateGreetings: ['Speak softly.', 'The stacks remember everything.'],
                tags: ['archive', 'mystery'],
                extensions: {
                    tone: 'whispered',
                },
            },
        }));

        expect(card).toEqual({
            name: 'Mira',
            description: 'An archivist of forbidden songs.',
            personality: 'Measured, curious, and kind.',
            scenario: 'A sealed library after dusk.',
            firstMessage: 'You made it past the wards.',
            exampleMessages: '',
            alternateGreetings: ['Speak softly.', 'The stacks remember everything.'],
            tags: ['archive', 'mystery'],
            characterBook: null,
            regexScripts: [],
            extensions: {
                tone: 'whispered',
            },
            rawVersion: '3.1',
            source: 'json-v3-like',
        });
    });

    it('falls back to root fields when data fields are missing', () => {
        const card = parseCharacterCardJson({
            spec_version: 3,
            data: {
                description: 'Stored in data.',
            },
            name: 'Fallback',
            personality: 'Root-level personality.',
            scenario: 'Root-level scenario.',
            first_mes: 'Root-level greeting.',
            tags: 'root, fallback',
            extensions: {
                imported: true,
            },
        });

        expect(card).toEqual({
            name: 'Fallback',
            description: 'Stored in data.',
            personality: 'Root-level personality.',
            scenario: 'Root-level scenario.',
            firstMessage: 'Root-level greeting.',
            exampleMessages: '',
            alternateGreetings: [],
            tags: ['root', 'fallback'],
            characterBook: null,
            regexScripts: [],
            extensions: {
                imported: true,
            },
            rawVersion: '3',
            source: 'json-v3-like',
        });
    });

    it('accepts string alternate greetings and trims comma-separated tags', () => {
        const card = parseCharacterCardJson({
            data: {
                name: 'Sable',
                alternate_greetings: 'Stay close.',
                tags: ' noir, detective , , city ',
            },
        });

        expect(card.alternateGreetings).toEqual(['Stay close.']);
        expect(card.tags).toEqual(['noir', 'detective', 'city']);
        expect(card.source).toBe('json-v2-like');
        expect(card.rawVersion).toBe('2.0');
    });

    it('normalizes a SillyTavern V1-style root character card', () => {
        const card = parseCharacterCardJson({
            name: 'Root Astra',
            description: 'Root-level character description.',
            personality: 'Old but dependable.',
            scenario: 'A bridge full of hand-labeled switches.',
            first_mes: 'Still flying.',
            alternate_greetings: ['Back on deck.'],
            tags: ['legacy'],
            creatorcomment: 'Imported from an older card export.',
        });

        expect(card).toMatchObject({
            name: 'Root Astra',
            description: 'Root-level character description.',
            personality: 'Old but dependable.',
            scenario: 'A bridge full of hand-labeled switches.',
            firstMessage: 'Still flying.',
            exampleMessages: '',
            alternateGreetings: ['Back on deck.'],
            tags: ['legacy'],
            rawVersion: '1.0',
            source: 'json-v1-like',
        });
    });

    it('normalizes notebook-style legacy character field aliases', () => {
        const card = parseCharacterCardJson({
            char_name: 'Notebook Mira',
            char_persona: 'An archivist described by a legacy notebook field.',
            char_personality: 'Careful and curious.',
            world_scenario: 'A sealed library after dusk.',
            char_greeting: 'You made it past the old locks.',
            alternate_greeting: 'The catalogue remembers you.',
        });

        expect(card).toMatchObject({
            name: 'Notebook Mira',
            description: 'An archivist described by a legacy notebook field.',
            personality: 'Careful and curious.',
            scenario: 'A sealed library after dusk.',
            firstMessage: 'You made it past the old locks.',
            exampleMessages: '',
            alternateGreetings: ['The catalogue remembers you.'],
            rawVersion: '1.0',
            source: 'json-v1-like',
        });
    });

    it('does not classify a bare named JSON object as a usable character card', () => {
        const card = parseCharacterCardJson({
            name: 'Not enough on its own',
        });

        expect(card).toMatchObject({
            name: 'Not enough on its own',
            rawVersion: 'unknown',
            source: 'json-unknown',
        });
    });

    it('returns an empty normalized card for invalid JSON input', () => {
        expect(parseCharacterCardJson('{not valid json')).toEqual({
            name: '',
            description: '',
            personality: '',
            scenario: '',
            firstMessage: '',
            exampleMessages: '',
            alternateGreetings: [],
            tags: [],
            characterBook: null,
            regexScripts: [],
            extensions: {},
            rawVersion: 'unknown',
            source: 'json-unknown',
        });
    });

    it('preserves embedded character books and scoped regex scripts', () => {
        const card = parseCharacterCardJson({
            spec: 'chara_card_v2',
            data: {
                name: 'Lore Keeper',
                character_book: {
                    name: 'Keeper Book',
                    entries: [
                        {
                            keys: ['sigil'],
                            content: 'The sigil opens the sealed door.',
                        },
                    ],
                },
                extensions: {
                    regex_scripts: [
                        {
                            scriptName: 'mask',
                            findRegex: '/secret/gi',
                            replaceString: 'hidden',
                            placement: [1],
                        },
                    ],
                },
            },
        });

        expect(card.characterBook).toMatchObject({
            name: 'Keeper Book',
            entries: [
                {
                    keys: ['sigil'],
                    content: 'The sigil opens the sealed door.',
                },
            ],
        });
        expect(card.regexScripts).toMatchObject([
            {
                scriptName: 'mask',
                findRegex: '/secret/gi',
                replaceString: 'hidden',
                placement: [1],
            },
        ]);
    });
});

describe('exampleMessages (mes_example)', () => {
    it('maps mes_example from V2 data payloads and V1 roots', () => {
        const v2 = parseCharacterCardJson({
            spec: 'chara_card_v2',
            data: {
                name: 'Astra',
                mes_example: '<START>\n{{user}}: hi\n{{char}}: hello',
            },
        });
        expect(v2.exampleMessages).toBe('<START>\n{{user}}: hi\n{{char}}: hello');

        const v1 = parseCharacterCardJson({
            name: 'Old',
            description: 'desc',
            mes_example: '<START>\nexample',
        });
        expect(v1.exampleMessages).toBe('<START>\nexample');
    });
});
