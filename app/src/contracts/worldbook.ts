export type ReforgedWorldbookSource =
    | 'sillytavern-world-info'
    | 'character-book'
    | 'unknown';

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

export interface ReforgedWorldbook {
    name: string;
    source: ReforgedWorldbookSource;
    entries: ReforgedWorldbookEntry[];
    raw: Record<string, unknown>;
}

export interface ReforgedWorldbookImportInput {
    fileName: string;
    mimeType?: string;
    text?: string;
}

export interface ReforgedWorldbookLibraryItem {
    id: string;
    worldbook: ReforgedWorldbook;
    source: ReforgedWorldbookImportSource;
    importedAt: string;
    warnings: string[];
}

export interface ReforgedWorldbookImportSource {
    fileName: string;
    mimeType?: string;
    format: 'json' | 'unknown';
}

export type ReforgedWorldbookImportFailureCode =
    | 'missing-content'
    | 'invalid-json'
    | 'unsupported-format'
    | 'empty-worldbook';

export interface ReforgedWorldbookImportSuccess {
    ok: true;
    worldbook: ReforgedWorldbook;
    source: ReforgedWorldbookImportSource;
    warnings: string[];
}

export interface ReforgedWorldbookImportFailure {
    ok: false;
    code: ReforgedWorldbookImportFailureCode;
    message: string;
    source: ReforgedWorldbookImportSource;
    warnings: string[];
}

export type ReforgedWorldbookImportResult =
    | ReforgedWorldbookImportSuccess
    | ReforgedWorldbookImportFailure;
