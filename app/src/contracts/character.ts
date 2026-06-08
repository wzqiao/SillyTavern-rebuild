// DRAFT: 待主干评审

export type ReforgedCharacterCardSource =
    | 'json-v2'
    | 'json-v2-like'
    | 'json-v3-like'
    | 'json-unknown';

export interface ReforgedCharacterCard {
    name: string;
    description: string;
    personality: string;
    scenario: string;
    firstMessage: string;
    alternateGreetings: string[];
    tags: string[];
    extensions: Record<string, unknown>;
    rawVersion: string;
    source: ReforgedCharacterCardSource;
}
