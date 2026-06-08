// DRAFT: 待主干评审

export type ReforgedCharacterCardSource =
    | 'json-v2'
    | 'json-v2-like'
    | 'json-v3-like'
    | 'json-unknown';

// DRAFT: 待主干评审
export type ReforgedCharacterCardPngChunkType = 'tEXt' | 'iTXt' | 'zTXt';

// DRAFT: 待主干评审
export type ReforgedCharacterCardPngParseReasonCode =
    | 'invalid-input'
    | 'invalid-png-signature'
    | 'invalid-png-chunk'
    | 'keyword-not-found'
    | 'compressed-metadata-unsupported'
    | 'metadata-not-json';

// DRAFT: 待主干评审
export interface ReforgedCharacterCardPngParseReason {
    code: ReforgedCharacterCardPngParseReasonCode;
    message: string;
    chunkType?: ReforgedCharacterCardPngChunkType;
    keyword?: string;
}

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

// DRAFT: 待主干评审
export interface ReforgedCharacterCardPngParseResult {
    card: ReforgedCharacterCard | null;
    chunkType: ReforgedCharacterCardPngChunkType | null;
    keyword: string | null;
    reasons: ReforgedCharacterCardPngParseReason[];
}
