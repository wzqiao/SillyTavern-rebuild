import type {
    ReforgedChatLorebookContext,
    ReforgedChatMessageStatus,
} from '@/contracts/chat';
import type { ReforgedWorldbookEntry, ReforgedWorldbookLibraryItem } from '@/contracts/worldbook';

const WORLD_INFO_SELECTIVE_LOGIC = {
    AND_ANY: 0,
    NOT_ALL: 1,
    NOT_ANY: 2,
    AND_ALL: 3,
} as const;

type WorldInfoSelectiveLogic = typeof WORLD_INFO_SELECTIVE_LOGIC[keyof typeof WORLD_INFO_SELECTIVE_LOGIC];

const WORLD_INFO_SELECTIVE_LOGIC_VALUES = new Set<number>(Object.values(WORLD_INFO_SELECTIVE_LOGIC));
const REGEX_KEY_PATTERN = /^\/([\w\W]+?)\/([gimsuy]*)$/;
const DEFAULT_GROUP_WEIGHT = 100;
const MAX_SCAN_DEPTH = 1000;

interface ResolvedWorldbookMatchSettings {
    caseSensitive: boolean;
    matchWholeWords: boolean;
}

interface LorebookScanContext {
    overrideText: string | null;
    messageTexts: string[];
    nextMessage: string;
    injects: string[];
    sources: Required<ReforgedChatLorebookScanSources>;
}

interface ReforgedWorldbookEntryCandidate {
    entry: ReforgedWorldbookEntry;
    index: number;
}

type ReforgedWorldbookScanState = 'initial' | 'recursion';

export interface ReforgedChatLorebookScanMessage {
    content: string;
    status?: ReforgedChatMessageStatus;
}

export interface ReforgedChatLorebookScanSources {
    personaDescription?: string;
    characterDescription?: string;
    characterPersonality?: string;
    characterDepthPrompt?: string;
    scenario?: string;
    creatorNotes?: string;
}

export interface ReforgedChatLorebookContextOptions {
    defaultCaseSensitive?: boolean;
    defaultMatchWholeWords?: boolean;
    defaultScanDepth?: number | null;
    generationTrigger?: string;
    includeInactivePreviewEntries?: boolean;
    maxRecursionSteps?: number;
    random?: () => number;
    recursive?: boolean;
    scanInjects?: string[];
    scanText?: string;
    messages?: ReforgedChatLorebookScanMessage[];
    nextMessage?: string;
    scanSources?: ReforgedChatLorebookScanSources;
}

export function createChatLorebookContext(
    libraryItem: ReforgedWorldbookLibraryItem,
    options: ReforgedChatLorebookContextOptions = {},
): ReforgedChatLorebookContext {
    const scanContext = createLorebookScanContext(options);
    const matchSettings = resolveMatchSettings(options);
    const candidates = activateWorldbookEntries(
        libraryItem.worldbook.entries.map((entry, index) => ({ entry, index })),
        scanContext,
        options,
        matchSettings,
    );

    return {
        id: libraryItem.id,
        name: libraryItem.worldbook.name,
        entries: candidates
            .sort((left, right) => {
                const byInsertionOrder = right.entry.insertionOrder - left.entry.insertionOrder;
                return byInsertionOrder || left.index - right.index;
            })
            .map(({ entry }) => ({
                id: entry.id,
                title: entry.comment.trim() || entry.primaryKeys.join(', ') || undefined,
                content: entry.content.trim(),
            })),
    };
}

function activateWorldbookEntries(
    entryCandidates: ReforgedWorldbookEntryCandidate[],
    scanContext: LorebookScanContext,
    options: ReforgedChatLorebookContextOptions,
    matchSettings: ResolvedWorldbookMatchSettings,
): ReforgedWorldbookEntryCandidate[] {
    const activated = new Map<ReforgedWorldbookEntry, ReforgedWorldbookEntryCandidate>();
    const failedProbabilityChecks = new Set<ReforgedWorldbookEntry>();
    const recursionTexts: string[] = [];
    const delayedRecursionLevels = createDelayedRecursionLevels(entryCandidates.map(({ entry }) => entry));
    const canScanRecursively = scanContext.overrideText === null;
    const recursive = options.recursive === true && canScanRecursively;
    const maxRecursionSteps = normalizeMaxRecursionSteps(options.maxRecursionSteps);
    let currentDelayLevel = delayedRecursionLevels.shift() ?? 0;
    let scanState: ReforgedWorldbookScanState | null = 'initial';
    let loopCount = 0;

    while (scanState) {
        if (maxRecursionSteps > 0 && maxRecursionSteps <= loopCount) {
            break;
        }

        const currentScanState = scanState;
        loopCount += 1;

        const loopCandidates = entryCandidates
            .filter(({ entry }) => !activated.has(entry))
            .filter(({ entry }) => !failedProbabilityChecks.has(entry))
            .filter(({ entry }) => shouldScanEntryForState(entry, currentScanState, currentDelayLevel, recursive))
            .filter(({ entry }) => shouldInjectEntry(
                entry,
                createEntryScanText(entry, scanContext, options, currentScanState, recursionTexts),
                options,
                matchSettings,
            ));

        const successfulCandidates = filterCandidatesByProbability(
            filterInclusionGroups(loopCandidates, options),
            options,
            failedProbabilityChecks,
        );

        for (const candidate of successfulCandidates) {
            activated.set(candidate.entry, candidate);
        }

        const recursionCandidates = successfulCandidates.filter(({ entry }) => !entry.preventRecursion);
        const recursionText = recursionCandidates
            .map(({ entry }) => entry.content.trim())
            .filter(Boolean)
            .join('\n');

        let nextScanState: ReforgedWorldbookScanState | null = null;
        if (recursive && recursionCandidates.length > 0) {
            nextScanState = 'recursion';
        }

        if (canScanRecursively && nextScanState === null && delayedRecursionLevels.length > 0) {
            currentDelayLevel = delayedRecursionLevels.shift() ?? 0;
            nextScanState = 'recursion';
        }

        if (nextScanState && recursionText) {
            recursionTexts.push(recursionText);
        }

        scanState = nextScanState;
    }

    return Array.from(activated.values());
}

function shouldInjectEntry(
    entry: ReforgedWorldbookEntry,
    scanText: string,
    options: ReforgedChatLorebookContextOptions,
    matchSettings: ResolvedWorldbookMatchSettings,
): boolean {
    if (!entry.enabled || !entry.content.trim()) {
        return false;
    }

    if (!shouldMatchGenerationTrigger(entry, options)) {
        return false;
    }

    if (entry.constant) {
        return true;
    }

    if (!scanText) {
        return Boolean(options.includeInactivePreviewEntries);
    }

    if (options.includeInactivePreviewEntries) {
        return true;
    }

    const primaryMatched = matchesAnyKey(scanText, entry.primaryKeys, entry, matchSettings);
    if (!primaryMatched) {
        return false;
    }

    if (!entry.selective) {
        return true;
    }

    return matchesSelectiveSecondaryKeys(scanText, entry, matchSettings);
}

function filterInclusionGroups(
    candidates: ReforgedWorldbookEntryCandidate[],
    options: ReforgedChatLorebookContextOptions,
): ReforgedWorldbookEntryCandidate[] {
    if (options.includeInactivePreviewEntries) {
        return candidates;
    }

    const winners = selectInclusionGroupWinners(candidates, options);
    return candidates.filter(({ entry }) => winners.has(entry));
}

function filterCandidatesByProbability(
    candidates: ReforgedWorldbookEntryCandidate[],
    options: ReforgedChatLorebookContextOptions,
    failedProbabilityChecks: Set<ReforgedWorldbookEntry>,
): ReforgedWorldbookEntryCandidate[] {
    return candidates.filter(({ entry }) => {
        const passed = shouldPassProbability(entry, options);
        if (!passed) {
            failedProbabilityChecks.add(entry);
        }

        return passed;
    });
}

function selectInclusionGroupWinners(
    candidates: ReforgedWorldbookEntryCandidate[],
    options: ReforgedChatLorebookContextOptions,
): Set<ReforgedWorldbookEntry> {
    const winners = new Set(candidates.map(({ entry }) => entry));
    const grouped = groupCandidatesByInclusionGroup(candidates);

    for (const groupCandidates of grouped.values()) {
        const activeGroup = groupCandidates.filter(({ entry }) => winners.has(entry));
        if (activeGroup.length <= 1) {
            continue;
        }

        const winner = selectInclusionGroupWinner(activeGroup, options);
        for (const { entry } of activeGroup) {
            if (entry !== winner?.entry) {
                winners.delete(entry);
            }
        }
    }

    return winners;
}

function groupCandidatesByInclusionGroup(
    candidates: ReforgedWorldbookEntryCandidate[],
): Map<string, ReforgedWorldbookEntryCandidate[]> {
    const grouped = new Map<string, ReforgedWorldbookEntryCandidate[]>();

    for (const candidate of candidates) {
        for (const group of parseInclusionGroups(candidate.entry.group)) {
            const groupCandidates = grouped.get(group) ?? [];
            groupCandidates.push(candidate);
            grouped.set(group, groupCandidates);
        }
    }

    return grouped;
}

function parseInclusionGroups(value: string): string[] {
    return value
        .split(/,\s*/)
        .map((group) => group.trim())
        .filter(Boolean);
}

function selectInclusionGroupWinner(
    candidates: ReforgedWorldbookEntryCandidate[],
    options: ReforgedChatLorebookContextOptions,
): ReforgedWorldbookEntryCandidate | null {
    const overrideWinner = candidates
        .filter(({ entry }) => entry.groupOverride)
        .sort((left, right) => {
            const byInsertionOrder = right.entry.insertionOrder - left.entry.insertionOrder;
            return byInsertionOrder || left.index - right.index;
        })[0];
    if (overrideWinner) {
        return overrideWinner;
    }

    const totalWeight = candidates.reduce((sum, { entry }) => sum + normalizeGroupWeight(entry.groupWeight), 0);
    if (totalWeight <= 0) {
        return candidates[0] ?? null;
    }

    const roll = readRandom(options) * totalWeight;
    let currentWeight = 0;

    for (const candidate of candidates) {
        currentWeight += normalizeGroupWeight(candidate.entry.groupWeight);
        if (roll <= currentWeight) {
            return candidate;
        }
    }

    return candidates.at(-1) ?? null;
}

function normalizeGroupWeight(value: number | null): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return DEFAULT_GROUP_WEIGHT;
    }

    return Math.max(0, value);
}

function shouldPassProbability(
    entry: ReforgedWorldbookEntry,
    options: ReforgedChatLorebookContextOptions,
): boolean {
    if (options.includeInactivePreviewEntries || !entry.useProbability) {
        return true;
    }

    const probability = normalizeProbability(entry.probability);
    if (probability >= 100) {
        return true;
    }

    return readProbabilityRoll(options) <= probability;
}

function normalizeProbability(value: number | null): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        // Reforged currently represents missing ST probability defaults as null.
        return 100;
    }

    return Math.min(100, Math.max(0, value));
}

function readProbabilityRoll(options: ReforgedChatLorebookContextOptions): number {
    const randomValue = readRandom(options);
    if (!Number.isFinite(randomValue)) {
        return 100;
    }

    return Math.min(100, Math.max(0, randomValue * 100));
}

function readRandom(options: ReforgedChatLorebookContextOptions): number {
    return options.random?.() ?? Math.random();
}

function shouldMatchGenerationTrigger(
    entry: ReforgedWorldbookEntry,
    options: ReforgedChatLorebookContextOptions,
): boolean {
    const generationTrigger = options.generationTrigger ?? 'normal';
    const trigger = generationTrigger.trim() || 'normal';
    const triggers = entry.triggers
        .map((trigger) => trigger.trim())
        .filter(Boolean);

    if (triggers.length === 0) {
        return true;
    }

    return triggers.includes(trigger);
}

function matchesAnyKey(
    scanText: string,
    keys: string[],
    entry: ReforgedWorldbookEntry,
    matchSettings: ResolvedWorldbookMatchSettings,
): boolean {
    return createKeyMatchResults(scanText, keys, entry, matchSettings)
        .some((result) => result.matched);
}

function matchesSelectiveSecondaryKeys(
    scanText: string,
    entry: ReforgedWorldbookEntry,
    matchSettings: ResolvedWorldbookMatchSettings,
): boolean {
    const secondaryMatches = createKeyMatchResults(scanText, entry.secondaryKeys, entry, matchSettings);

    if (secondaryMatches.length === 0) {
        return true;
    }

    const matchedCount = secondaryMatches.filter((result) => result.matched).length;
    const logic = normalizeSelectiveLogic(entry.selectiveLogic);

    if (logic === WORLD_INFO_SELECTIVE_LOGIC.AND_ALL) {
        return matchedCount === secondaryMatches.length;
    }

    if (logic === WORLD_INFO_SELECTIVE_LOGIC.NOT_ALL) {
        return matchedCount < secondaryMatches.length;
    }

    if (logic === WORLD_INFO_SELECTIVE_LOGIC.NOT_ANY) {
        return matchedCount === 0;
    }

    return matchedCount > 0;
}

function createKeyMatchResults(
    scanText: string,
    keys: string[],
    entry: ReforgedWorldbookEntry,
    matchSettings: ResolvedWorldbookMatchSettings,
): { key: string; matched: boolean }[] {
    return keys
        .map((key) => key.trim())
        .filter(Boolean)
        .map((key) => ({
            key,
            matched: matchesKey(scanText, key, entry, matchSettings),
        }));
}

function normalizeSelectiveLogic(value: number | null): number {
    if (typeof value === 'number' && WORLD_INFO_SELECTIVE_LOGIC_VALUES.has(value)) {
        return value as WorldInfoSelectiveLogic;
    }

    return WORLD_INFO_SELECTIVE_LOGIC.AND_ANY;
}

function matchesKey(
    scanText: string,
    key: string,
    entry: ReforgedWorldbookEntry,
    matchSettings: ResolvedWorldbookMatchSettings,
): boolean {
    const regexKey = parseRegexKey(key);
    if (regexKey) {
        return regexKey.test(scanText);
    }

    const caseSensitive = entry.caseSensitive ?? matchSettings.caseSensitive;
    const matchWholeWords = entry.matchWholeWords ?? matchSettings.matchWholeWords;
    const haystack = caseSensitive ? scanText : scanText.toLocaleLowerCase();
    const needle = caseSensitive ? key : key.toLocaleLowerCase();

    if (matchWholeWords) {
        if (needle.split(/\s+/).length > 1) {
            return haystack.includes(needle);
        }

        return matchesWholeWord(haystack, needle);
    }

    return haystack.includes(needle);
}

function resolveMatchSettings(options: ReforgedChatLorebookContextOptions): ResolvedWorldbookMatchSettings {
    return {
        caseSensitive: options.defaultCaseSensitive ?? false,
        matchWholeWords: options.defaultMatchWholeWords ?? false,
    };
}

function parseRegexKey(key: string): RegExp | null {
    const match = key.match(REGEX_KEY_PATTERN);
    if (!match) {
        return null;
    }

    const [, rawPattern, flags] = match;
    if (/(^|[^\\])\//.test(rawPattern)) {
        return null;
    }

    try {
        return new RegExp(rawPattern.replace('\\/', '/'), flags);
    } catch {
        return null;
    }
}

function createLorebookScanContext(options: ReforgedChatLorebookContextOptions): LorebookScanContext {
    if (options.scanText !== undefined) {
        return {
            overrideText: options.scanText.trim(),
            messageTexts: [],
            nextMessage: '',
            injects: normalizeScanInjects(options.scanInjects),
            sources: normalizeScanSources(options.scanSources),
        };
    }

    return {
        overrideText: null,
        messageTexts: (options.messages ?? [])
            .filter((message) => message.status !== 'failed')
            .map((message) => message.content.trim())
            .filter(Boolean),
        nextMessage: options.nextMessage?.trim() ?? '',
        injects: normalizeScanInjects(options.scanInjects),
        sources: normalizeScanSources(options.scanSources),
    };
}

function createEntryScanText(
    entry: ReforgedWorldbookEntry,
    context: LorebookScanContext,
    options: ReforgedChatLorebookContextOptions,
    scanState: ReforgedWorldbookScanState = 'initial',
    recursionTexts: string[] = [],
): string {
    if (context.overrideText !== null) {
        return context.overrideText;
    }

    const scanChunks = readEntryScanChunks(entry, [
        ...context.messageTexts,
        context.nextMessage,
    ].filter(Boolean), options);

    if (scanChunks === null) {
        return '';
    }

    return [
        ...scanChunks,
        ...readEntryScanSources(entry, context.sources),
        ...context.injects,
        ...(scanState === 'recursion' ? recursionTexts : []),
    ].filter(Boolean).join('\n');
}

function readEntryScanChunks(
    entry: ReforgedWorldbookEntry,
    chunks: string[],
    options: ReforgedChatLorebookContextOptions,
): string[] | null {
    const scanDepth = entry.scanDepth ?? options.defaultScanDepth ?? null;
    if (scanDepth === null) {
        return chunks;
    }

    const depth = Math.min(MAX_SCAN_DEPTH, Math.floor(scanDepth));
    if (depth <= 0) {
        return null;
    }

    return chunks.slice(-depth);
}

function readEntryScanSources(
    entry: ReforgedWorldbookEntry,
    sources: Required<ReforgedChatLorebookScanSources>,
): string[] {
    return [
        entry.matchPersonaDescription ? sources.personaDescription : '',
        entry.matchCharacterDescription ? sources.characterDescription : '',
        entry.matchCharacterPersonality ? sources.characterPersonality : '',
        entry.matchCharacterDepthPrompt ? sources.characterDepthPrompt : '',
        entry.matchScenario ? sources.scenario : '',
        entry.matchCreatorNotes ? sources.creatorNotes : '',
    ].filter(Boolean);
}

function normalizeScanSources(sources: ReforgedChatLorebookScanSources = {}): Required<ReforgedChatLorebookScanSources> {
    return {
        personaDescription: sources.personaDescription?.trim() ?? '',
        characterDescription: sources.characterDescription?.trim() ?? '',
        characterPersonality: sources.characterPersonality?.trim() ?? '',
        characterDepthPrompt: sources.characterDepthPrompt?.trim() ?? '',
        scenario: sources.scenario?.trim() ?? '',
        creatorNotes: sources.creatorNotes?.trim() ?? '',
    };
}

function normalizeScanInjects(injects: string[] = []): string[] {
    return injects
        .map((inject) => inject.trim())
        .filter(Boolean);
}

function shouldScanEntryForState(
    entry: ReforgedWorldbookEntry,
    scanState: ReforgedWorldbookScanState,
    currentDelayLevel: number,
    recursive: boolean,
): boolean {
    const delayLevel = normalizeRecursionDelayLevel(entry.delayUntilRecursion);
    if (scanState !== 'recursion' && delayLevel > 0) {
        return false;
    }

    if (scanState === 'recursion' && delayLevel > currentDelayLevel) {
        return false;
    }

    if (scanState === 'recursion' && recursive && entry.excludeRecursion) {
        return false;
    }

    return true;
}

function createDelayedRecursionLevels(entries: ReforgedWorldbookEntry[]): number[] {
    return Array.from(new Set(
        entries
            .map((entry) => normalizeRecursionDelayLevel(entry.delayUntilRecursion))
            .filter((level) => level > 0),
    )).sort((left, right) => left - right);
}

function normalizeRecursionDelayLevel(value: boolean | number): number {
    if (value === true) {
        return 1;
    }

    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 0;
    }

    return Math.max(0, Math.floor(value));
}

function normalizeMaxRecursionSteps(value: number | undefined): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 0;
    }

    return Math.max(0, Math.floor(value));
}

function matchesWholeWord(haystack: string, needle: string): boolean {
    let fromIndex = 0;

    while (fromIndex <= haystack.length) {
        const index = haystack.indexOf(needle, fromIndex);
        if (index === -1) {
            return false;
        }

        if (hasUnicodeWordBoundary(haystack, index, needle.length)) {
            return true;
        }

        fromIndex = index + needle.length;
    }

    return false;
}

function hasUnicodeWordBoundary(value: string, index: number, length: number): boolean {
    const before = getPreviousCodePoint(value, index);
    const after = getNextCodePoint(value, index + length);

    return !isWordCharacter(before) && !isWordCharacter(after);
}

function getPreviousCodePoint(value: string, index: number): string {
    if (index <= 0) {
        return '';
    }

    return Array.from(value.slice(0, index)).at(-1) ?? '';
}

function getNextCodePoint(value: string, index: number): string {
    return Array.from(value.slice(index))[0] ?? '';
}

function isWordCharacter(value: string): boolean {
    return value ? /[\p{Letter}\p{Number}_]/u.test(value) : false;
}
