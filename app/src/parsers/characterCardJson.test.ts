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
            alternateGreetings: ['Ready for departure.', 'Charting a new route.'],
            tags: ['space', 'captain'],
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
            alternateGreetings: ['Speak softly.', 'The stacks remember everything.'],
            tags: ['archive', 'mystery'],
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
            alternateGreetings: [],
            tags: ['root', 'fallback'],
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

    it('returns an empty normalized card for invalid JSON input', () => {
        expect(parseCharacterCardJson('{not valid json')).toEqual({
            name: '',
            description: '',
            personality: '',
            scenario: '',
            firstMessage: '',
            alternateGreetings: [],
            tags: [],
            extensions: {},
            rawVersion: 'unknown',
            source: 'json-unknown',
        });
    });
});
