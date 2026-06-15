export const REFORGED_REGEX_PLACEMENT = {
    USER_INPUT: 1,
    AI_OUTPUT: 2,
    WORLD_INFO: 5,
} as const;

export type ReforgedRegexPlacement = typeof REFORGED_REGEX_PLACEMENT[keyof typeof REFORGED_REGEX_PLACEMENT];

export interface ReforgedRegexScript {
    scriptName?: string;
    findRegex: string;
    replaceString: string;
    placement: ReforgedRegexPlacement[];
    disabled?: boolean;
    markdownOnly?: boolean;
    promptOnly?: boolean;
    runOnEdit?: boolean;
    minDepth?: number | null;
    maxDepth?: number | null;
    substituteRegex?: number;
    trimStrings?: string[];
    raw?: Record<string, unknown>;
}
