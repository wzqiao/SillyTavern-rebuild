// DRAFT: 待主干评审

export type ReforgedWorldbookSource =
    | 'sillytavern-world-info'
    | 'character-book'
    | 'unknown';

// DRAFT: 待主干评审
export type ReforgedWorldbookEntryPosition =
    | 'before'
    | 'after'
    | 'author-note-top'
    | 'author-note-bottom'
    | 'at-depth'
    | 'examples-top'
    | 'examples-bottom'
    | 'outlet'
    | 'unknown';

// DRAFT: 待主干评审
export interface ReforgedWorldbookEntry {
    id: string;
    uid: string | number | null;
    comment: string;
    content: string;
    primaryKeys: string[];
    secondaryKeys: string[];
    enabled: boolean;
    constant: boolean;
    selective: boolean;
    selectiveLogic: number | null;
    insertionOrder: number;
    displayIndex: number | null;
    position: ReforgedWorldbookEntryPosition;
    positionRaw: unknown;
    role: string | number | null;
    depth: number | null;
    scanDepth: number | null;
    probability: number | null;
    useProbability: boolean;
    caseSensitive: boolean | null;
    matchWholeWords: boolean | null;
    useGroupScoring: boolean | null;
    vectorized: boolean;
    addMemo: boolean;
    excludeRecursion: boolean;
    preventRecursion: boolean;
    delayUntilRecursion: boolean | number;
    ignoreBudget: boolean;
    group: string;
    groupOverride: boolean;
    groupWeight: number | null;
    outletName: string;
    automationId: string;
    sticky: number | null;
    cooldown: number | null;
    delay: number | null;
    triggers: string[];
    matchPersonaDescription: boolean;
    matchCharacterDescription: boolean;
    matchCharacterPersonality: boolean;
    matchCharacterDepthPrompt: boolean;
    matchScenario: boolean;
    matchCreatorNotes: boolean;
    extensionsRaw: Record<string, unknown> | null;
    raw: Record<string, unknown>;
}

// DRAFT: 待主干评审
export interface ReforgedWorldbook {
    name: string;
    source: ReforgedWorldbookSource;
    entries: ReforgedWorldbookEntry[];
    raw: Record<string, unknown>;
}

// DRAFT: 待主干评审
export interface ReforgedWorldbookImportInput {
    fileName: string;
    mimeType?: string;
    text?: string;
}

// DRAFT: 待主干评审
export interface ReforgedWorldbookImportSource {
    fileName: string;
    mimeType?: string;
    format: 'json' | 'unknown';
}

// DRAFT: 待主干评审
export type ReforgedWorldbookImportFailureCode =
    | 'missing-content'
    | 'invalid-json'
    | 'unsupported-format'
    | 'empty-worldbook';

// DRAFT: 待主干评审
export interface ReforgedWorldbookImportSuccess {
    ok: true;
    worldbook: ReforgedWorldbook;
    source: ReforgedWorldbookImportSource;
    warnings: string[];
}

// DRAFT: 待主干评审
export interface ReforgedWorldbookImportFailure {
    ok: false;
    code: ReforgedWorldbookImportFailureCode;
    message: string;
    source: ReforgedWorldbookImportSource;
    warnings: string[];
}

// DRAFT: 待主干评审
export type ReforgedWorldbookImportResult =
    | ReforgedWorldbookImportSuccess
    | ReforgedWorldbookImportFailure;
