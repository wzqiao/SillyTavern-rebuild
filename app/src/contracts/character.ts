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

// DRAFT: 待主干评审
export type ReforgedCharacterImportFormat =
    | 'json'
    | 'png'
    | 'yaml'
    | 'charx'
    | 'byaf'
    | 'unknown';

// DRAFT: 待主干评审
export type ReforgedCharacterImportFailureCode =
    | 'unsupported-format'
    | 'missing-content'
    | 'invalid-json'
    | 'empty-character-card'
    | 'png-metadata-not-found'
    | 'png-metadata-invalid';

// DRAFT: 待主干评审
export interface ReforgedCharacterImportInput {
    fileName: string;
    mimeType?: string;
    text?: string;
    bytes?: ArrayBuffer | Uint8Array | readonly number[];
}

// DRAFT: 待主干评审
export interface ReforgedCharacterImportSource {
    fileName: string;
    format: ReforgedCharacterImportFormat;
    mimeType?: string;
}

// DRAFT: 待主干评审
export interface ReforgedCharacterImportSuccess {
    ok: true;
    card: ReforgedCharacterCard;
    source: ReforgedCharacterImportSource;
    warnings: ReforgedCharacterCardPngParseReason[];
}

// DRAFT: 待主干评审
export interface ReforgedCharacterImportFailure {
    ok: false;
    code: ReforgedCharacterImportFailureCode;
    message: string;
    source: ReforgedCharacterImportSource;
    reasons: ReforgedCharacterCardPngParseReason[];
}

// DRAFT: 待主干评审
export type ReforgedCharacterImportResult =
    | ReforgedCharacterImportSuccess
    | ReforgedCharacterImportFailure;

// DRAFT: 待主干评审
export interface ReforgedCharacterRosterItem {
    id: string;
    card: ReforgedCharacterCard;
    source: ReforgedCharacterImportSource;
    importedAt: string;
    warnings: ReforgedCharacterCardPngParseReason[];
}
