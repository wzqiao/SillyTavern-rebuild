export type ReforgedCharacterCardSource =
    | 'json-v1-like'
    | 'json-v2'
    | 'json-v2-like'
    | 'json-v3-like'
    | 'json-unknown';

export type ReforgedCharacterCardPngChunkType = 'tEXt' | 'iTXt' | 'zTXt';

export type ReforgedCharacterCardPngParseReasonCode =
    | 'invalid-input'
    | 'invalid-png-signature'
    | 'invalid-png-chunk'
    | 'keyword-not-found'
    | 'compressed-metadata-unsupported'
    | 'metadata-not-json';

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
    /** 旧版 mes_example 原文(<START> 分块),M2.5-A2。 */
    exampleMessages: string;
    alternateGreetings: string[];
    tags: string[];
    extensions: Record<string, unknown>;
    rawVersion: string;
    source: ReforgedCharacterCardSource;
}

export interface ReforgedCharacterCardPngParseResult {
    card: ReforgedCharacterCard | null;
    chunkType: ReforgedCharacterCardPngChunkType | null;
    keyword: string | null;
    reasons: ReforgedCharacterCardPngParseReason[];
}

export type ReforgedCharacterImportFormat =
    | 'json'
    | 'png'
    | 'yaml'
    | 'charx'
    | 'byaf'
    | 'unknown';

export type ReforgedCharacterImportFailureCode =
    | 'unsupported-format'
    | 'missing-content'
    | 'invalid-json'
    | 'empty-character-card'
    | 'png-metadata-not-found'
    | 'png-metadata-invalid';

export interface ReforgedCharacterImportInput {
    fileName: string;
    mimeType?: string;
    text?: string;
    bytes?: ArrayBuffer | Uint8Array | readonly number[];
}

export interface ReforgedCharacterImportSource {
    fileName: string;
    format: ReforgedCharacterImportFormat;
    mimeType?: string;
}

export interface ReforgedCharacterImportSuccess {
    ok: true;
    card: ReforgedCharacterCard;
    source: ReforgedCharacterImportSource;
    warnings: ReforgedCharacterCardPngParseReason[];
}

export interface ReforgedCharacterImportFailure {
    ok: false;
    code: ReforgedCharacterImportFailureCode;
    message: string;
    source: ReforgedCharacterImportSource;
    reasons: ReforgedCharacterCardPngParseReason[];
}

export type ReforgedCharacterImportResult =
    | ReforgedCharacterImportSuccess
    | ReforgedCharacterImportFailure;

export interface ReforgedCharacterRosterItem {
    id: string;
    card: ReforgedCharacterCard;
    source: ReforgedCharacterImportSource;
    importedAt: string;
    warnings: ReforgedCharacterCardPngParseReason[];
}
