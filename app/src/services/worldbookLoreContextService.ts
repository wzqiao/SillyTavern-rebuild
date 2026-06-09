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

interface ResolvedWorldbookTimedEffects {
    sticky: Set<string>;
    cooldown: Set<string>;
}

interface ResolvedWorldbookTokenBudget {
    countTokens: ReforgedChatLorebookTokenCounter;
    limit: number | null;
    overflowed: boolean;
    used: number;
}

type ReforgedWorldbookScanState = 'initial' | 'recursion';
type ReforgedWorldbookLoopState = ReforgedWorldbookScanState | 'min-activations';

export type ReforgedChatLorebookTokenCounter = (text: string) => number;

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

export interface ReforgedChatLorebookTimedEffects {
    stickyEntryIds?: string[];
    cooldownEntryIds?: string[];
}

export interface ReforgedChatLorebookContextOptions {
    defaultCaseSensitive?: boolean;
    defaultMatchWholeWords?: boolean;
    defaultScanDepth?: number | null;
    defaultUseGroupScoring?: boolean;
    generationTrigger?: string;
    includeInactivePreviewEntries?: boolean;
    maxRecursionSteps?: number;
    minimumActivations?: number;
    minimumActivationsDepthMax?: number;
    contextTokenLimit?: number | null;
    countTokens?: ReforgedChatLorebookTokenCounter;
    random?: () => number;
    recursive?: boolean;
    scanInjects?: string[];
    scanText?: string;
    tokenBudget?: number | null;
    tokenBudgetCap?: number;
    tokenBudgetPercent?: number;
    messages?: ReforgedChatLorebookScanMessage[];
    nextMessage?: string;
    scanSources?: ReforgedChatLorebookScanSources;
    timedEffects?: ReforgedChatLorebookTimedEffects;
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
    const timedEffects = resolveTimedEffects(options);
    const tokenBudget = resolveTokenBudget(options);
    const canScanRecursively = scanContext.overrideText === null;
    const recursive = options.recursive === true && canScanRecursively;
    const maxRecursionSteps = normalizeMaxRecursionSteps(options.maxRecursionSteps);
    const minimumActivations = canScanRecursively ? normalizeMinimumActivations(options.minimumActivations) : 0;
    const minimumActivationsDepthMax = normalizeMinimumActivationsDepthMax(options.minimumActivationsDepthMax);
    const maxScanChunks = countScanChunks(scanContext);
    let currentDelayLevel = delayedRecursionLevels.shift() ?? 0;
    let scanState: ReforgedWorldbookLoopState | null = 'initial';
    let scanDepthSkew = 0;
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
            .filter(({ entry }) => shouldScanEntryForTimedEffects(entry, timedEffects, maxScanChunks))
            .filter(({ entry }) => shouldScanEntryForState(entry, currentScanState, currentDelayLevel, recursive, timedEffects))
            .filter(({ entry }) => shouldInjectEntry(
                entry,
                createEntryScanText(entry, scanContext, options, currentScanState, recursionTexts, scanDepthSkew),
                options,
                matchSettings,
                timedEffects,
            ));

        const orderedLoopCandidates = sortCandidatesForActivationLimits(loopCandidates, timedEffects);
        const successfulCandidates = filterCandidatesByActivationLimits(
            filterInclusionGroups(
                orderedLoopCandidates,
                Array.from(activated.keys()),
                scanContext,
                options,
                matchSettings,
                currentScanState,
                recursionTexts,
                scanDepthSkew,
                timedEffects,
                maxScanChunks,
            ),
            options,
            failedProbabilityChecks,
            timedEffects,
            tokenBudget,
        );

        for (const candidate of successfulCandidates) {
            activated.set(candidate.entry, candidate);
        }

        const recursionCandidates = successfulCandidates.filter(({ entry }) => !entry.preventRecursion);
        const recursionText = recursionCandidates
            .map(({ entry }) => entry.content.trim())
            .filter(Boolean)
            .join('\n');

        let nextScanState: ReforgedWorldbookLoopState | null = null;
        if (recursive && !tokenBudget.overflowed && recursionCandidates.length > 0) {
            nextScanState = 'recursion';
        }

        if (
            recursive &&
            !tokenBudget.overflowed &&
            nextScanState === null &&
            currentScanState === 'min-activations' &&
            recursionTexts.length > 0
        ) {
            nextScanState = 'recursion';
        }

        if (
            nextScanState === null &&
            !tokenBudget.overflowed &&
            minimumActivations > 0 &&
            activated.size < minimumActivations &&
            canAdvanceMinimumActivationScan(options, scanDepthSkew, maxScanChunks, minimumActivationsDepthMax)
        ) {
            scanDepthSkew += 1;
            nextScanState = 'min-activations';
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
    timedEffects: ResolvedWorldbookTimedEffects,
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

    if (isTimedEffectActive('sticky', entry, timedEffects)) {
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

function sortCandidatesForActivationLimits(
    candidates: ReforgedWorldbookEntryCandidate[],
    timedEffects: ResolvedWorldbookTimedEffects,
): ReforgedWorldbookEntryCandidate[] {
    return [...candidates].sort((left, right) => {
        const bySticky = Number(isTimedEffectActive('sticky', right.entry, timedEffects)) -
            Number(isTimedEffectActive('sticky', left.entry, timedEffects));
        const byInsertionOrder = right.entry.insertionOrder - left.entry.insertionOrder;
        return bySticky || byInsertionOrder || left.index - right.index;
    });
}

function filterInclusionGroups(
    candidates: ReforgedWorldbookEntryCandidate[],
    previouslyActivatedEntries: ReforgedWorldbookEntry[],
    scanContext: LorebookScanContext,
    options: ReforgedChatLorebookContextOptions,
    matchSettings: ResolvedWorldbookMatchSettings,
    scanState: ReforgedWorldbookLoopState = 'initial',
    recursionTexts: string[] = [],
    scanDepthSkew = 0,
    timedEffects: ResolvedWorldbookTimedEffects,
    scanChunkCount: number,
): ReforgedWorldbookEntryCandidate[] {
    if (options.includeInactivePreviewEntries) {
        return candidates;
    }

    const winners = selectInclusionGroupWinners(
        candidates,
        previouslyActivatedEntries,
        scanContext,
        options,
        matchSettings,
        scanState,
        recursionTexts,
        scanDepthSkew,
        timedEffects,
        scanChunkCount,
    );
    return candidates.filter(({ entry }) => winners.has(entry));
}

function filterCandidatesByActivationLimits(
    candidates: ReforgedWorldbookEntryCandidate[],
    options: ReforgedChatLorebookContextOptions,
    failedProbabilityChecks: Set<ReforgedWorldbookEntry>,
    timedEffects: ResolvedWorldbookTimedEffects,
    tokenBudget: ResolvedWorldbookTokenBudget,
): ReforgedWorldbookEntryCandidate[] {
    const successfulCandidates: ReforgedWorldbookEntryCandidate[] = [];
    let remainingIgnoreBudgetCandidates = candidates.filter(({ entry }) => entry.ignoreBudget).length;

    for (const candidate of candidates) {
        const { entry } = candidate;
        remainingIgnoreBudgetCandidates -= entry.ignoreBudget ? 1 : 0;

        if (tokenBudget.overflowed && !entry.ignoreBudget) {
            if (remainingIgnoreBudgetCandidates > 0) {
                continue;
            }
            break;
        }

        const passed = shouldPassProbability(entry, options, timedEffects);
        if (!passed) {
            failedProbabilityChecks.add(entry);
            continue;
        }

        if (tokenBudget.limit === null) {
            successfulCandidates.push(candidate);
            continue;
        }

        const entryTokens = countEntryTokens(entry, tokenBudget.countTokens);
        tokenBudget.used += entryTokens;
        if (!entry.ignoreBudget && wouldOverflowTokenBudget(tokenBudget)) {
            tokenBudget.overflowed = true;
            continue;
        }

        successfulCandidates.push(candidate);
    }

    return successfulCandidates;
}

function selectInclusionGroupWinners(
    candidates: ReforgedWorldbookEntryCandidate[],
    previouslyActivatedEntries: ReforgedWorldbookEntry[],
    scanContext: LorebookScanContext,
    options: ReforgedChatLorebookContextOptions,
    matchSettings: ResolvedWorldbookMatchSettings,
    scanState: ReforgedWorldbookLoopState,
    recursionTexts: string[],
    scanDepthSkew: number,
    timedEffects: ResolvedWorldbookTimedEffects,
    scanChunkCount: number,
): Set<ReforgedWorldbookEntry> {
    const winners = new Set(candidates.map(({ entry }) => entry));
    const grouped = groupCandidatesByInclusionGroup(candidates);

    for (const [group, groupCandidates] of grouped.entries()) {
        const activeGroup = groupCandidates.filter(({ entry }) => winners.has(entry));
        if (wasInclusionGroupAlreadyActivated(group, previouslyActivatedEntries)) {
            for (const { entry } of activeGroup) {
                winners.delete(entry);
            }
            continue;
        }

        const timedGroup = filterInclusionGroupByTimedEffects(activeGroup, timedEffects, scanChunkCount);
        for (const { entry } of activeGroup) {
            if (!timedGroup.some((candidate) => candidate.entry === entry)) {
                winners.delete(entry);
            }
        }

        if (timedGroup.some(({ entry }) => isTimedEffectActive('sticky', entry, timedEffects))) {
            continue;
        }

        const activeTimedGroup = timedGroup.filter(({ entry }) => winners.has(entry));
        if (activeTimedGroup.length <= 1) {
            continue;
        }

        const scoredGroup = filterInclusionGroupByScore(
            activeTimedGroup,
            scanContext,
            options,
            matchSettings,
            scanState,
            recursionTexts,
            scanDepthSkew,
        );
        for (const { entry } of activeTimedGroup) {
            if (!scoredGroup.some((candidate) => candidate.entry === entry)) {
                winners.delete(entry);
            }
        }

        const winner = selectInclusionGroupWinner(scoredGroup, options);
        for (const { entry } of activeTimedGroup) {
            if (entry !== winner?.entry) {
                winners.delete(entry);
            }
        }
    }

    return winners;
}

function wasInclusionGroupAlreadyActivated(
    group: string,
    previouslyActivatedEntries: ReforgedWorldbookEntry[],
): boolean {
    return previouslyActivatedEntries.some((entry) => entry.group === group);
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

function filterInclusionGroupByTimedEffects(
    candidates: ReforgedWorldbookEntryCandidate[],
    timedEffects: ResolvedWorldbookTimedEffects,
    scanChunkCount: number,
): ReforgedWorldbookEntryCandidate[] {
    const stickyEntries = candidates.filter(({ entry }) => isTimedEffectActive('sticky', entry, timedEffects));
    if (stickyEntries.length > 0) {
        return stickyEntries;
    }

    return candidates.filter(({ entry }) => shouldScanEntryForTimedEffects(entry, timedEffects, scanChunkCount));
}

function filterInclusionGroupByScore(
    candidates: ReforgedWorldbookEntryCandidate[],
    scanContext: LorebookScanContext,
    options: ReforgedChatLorebookContextOptions,
    matchSettings: ResolvedWorldbookMatchSettings,
    scanState: ReforgedWorldbookLoopState,
    recursionTexts: string[],
    scanDepthSkew: number,
): ReforgedWorldbookEntryCandidate[] {
    if (!candidates.some(({ entry }) => shouldUseGroupScoring(entry, options))) {
        return candidates;
    }

    const scoredCandidates = candidates.map((candidate) => ({
        candidate,
        score: calculateGroupScore(
            candidate.entry,
            createEntryScanText(candidate.entry, scanContext, options, scanState, recursionTexts, scanDepthSkew),
            matchSettings,
        ),
    }));
    const maxScore = Math.max(...scoredCandidates.map(({ score }) => score));

    return scoredCandidates
        .filter(({ candidate, score }) => !shouldUseGroupScoring(candidate.entry, options) || score >= maxScore)
        .map(({ candidate }) => candidate);
}

function shouldUseGroupScoring(
    entry: ReforgedWorldbookEntry,
    options: ReforgedChatLorebookContextOptions,
): boolean {
    return entry.useGroupScoring ?? options.defaultUseGroupScoring ?? false;
}

function calculateGroupScore(
    entry: ReforgedWorldbookEntry,
    scanText: string,
    matchSettings: ResolvedWorldbookMatchSettings,
): number {
    const primaryMatches = createKeyMatchResults(scanText, entry.primaryKeys, entry, matchSettings);
    if (primaryMatches.length === 0) {
        return 0;
    }

    const primaryScore = primaryMatches.filter(({ matched }) => matched).length;
    const secondaryMatches = createKeyMatchResults(scanText, entry.secondaryKeys, entry, matchSettings);
    if (secondaryMatches.length === 0) {
        return primaryScore;
    }

    const secondaryScore = secondaryMatches.filter(({ matched }) => matched).length;
    const logic = normalizeSelectiveLogic(entry.selectiveLogic);

    if (logic === WORLD_INFO_SELECTIVE_LOGIC.AND_ANY) {
        return primaryScore + secondaryScore;
    }

    if (logic === WORLD_INFO_SELECTIVE_LOGIC.AND_ALL && secondaryScore === secondaryMatches.length) {
        return primaryScore + secondaryScore;
    }

    return primaryScore;
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
    timedEffects: ResolvedWorldbookTimedEffects,
): boolean {
    if (options.includeInactivePreviewEntries || !entry.useProbability) {
        return true;
    }

    if (isTimedEffectActive('sticky', entry, timedEffects)) {
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
    scanState: ReforgedWorldbookLoopState = 'initial',
    recursionTexts: string[] = [],
    scanDepthSkew = 0,
): string {
    if (context.overrideText !== null) {
        return context.overrideText;
    }

    const scanChunks = readEntryScanChunks(entry, [
        ...context.messageTexts,
        context.nextMessage,
    ].filter(Boolean), options, scanDepthSkew);

    if (scanChunks === null) {
        return '';
    }

    return [
        ...scanChunks,
        ...readEntryScanSources(entry, context.sources),
        ...context.injects,
        ...(scanState !== 'min-activations' ? recursionTexts : []),
    ].filter(Boolean).join('\n');
}

function readEntryScanChunks(
    entry: ReforgedWorldbookEntry,
    chunks: string[],
    options: ReforgedChatLorebookContextOptions,
    scanDepthSkew = 0,
): string[] | null {
    const scanDepth = resolveEntryScanDepth(entry, options, scanDepthSkew);
    if (scanDepth === null) {
        return chunks;
    }

    const depth = Math.min(MAX_SCAN_DEPTH, Math.floor(scanDepth));
    if (depth <= 0) {
        return null;
    }

    return chunks.slice(-depth);
}

function resolveEntryScanDepth(
    entry: ReforgedWorldbookEntry,
    options: ReforgedChatLorebookContextOptions,
    scanDepthSkew: number,
): number | null {
    if (entry.scanDepth !== null) {
        return entry.scanDepth;
    }

    const defaultScanDepth = resolveDefaultScanDepth(options.defaultScanDepth);
    if (defaultScanDepth === null) {
        return null;
    }

    return defaultScanDepth + scanDepthSkew;
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
    scanState: ReforgedWorldbookLoopState,
    currentDelayLevel: number,
    recursive: boolean,
    timedEffects: ResolvedWorldbookTimedEffects,
): boolean {
    const isSticky = isTimedEffectActive('sticky', entry, timedEffects);
    const delayLevel = normalizeRecursionDelayLevel(entry.delayUntilRecursion);
    if (scanState !== 'recursion' && delayLevel > 0 && !isSticky) {
        return false;
    }

    if (scanState === 'recursion' && delayLevel > currentDelayLevel && !isSticky) {
        return false;
    }

    if (scanState === 'recursion' && recursive && entry.excludeRecursion && !isSticky) {
        return false;
    }

    return true;
}

function shouldScanEntryForTimedEffects(
    entry: ReforgedWorldbookEntry,
    timedEffects: ResolvedWorldbookTimedEffects,
    scanChunkCount: number,
): boolean {
    const isSticky = isTimedEffectActive('sticky', entry, timedEffects);
    const isCooldown = isTimedEffectActive('cooldown', entry, timedEffects);
    if (isCooldown && !isSticky) {
        return false;
    }

    if (isTimedDelayActive(entry, scanChunkCount)) {
        return false;
    }

    return true;
}

function isTimedDelayActive(entry: ReforgedWorldbookEntry, scanChunkCount: number): boolean {
    const delay = normalizeTimedEffectDuration(entry.delay);
    return delay !== null && scanChunkCount < delay;
}

function isTimedEffectActive(
    type: keyof ResolvedWorldbookTimedEffects,
    entry: ReforgedWorldbookEntry,
    timedEffects: ResolvedWorldbookTimedEffects,
): boolean {
    return getEntryTimedEffectIds(entry).some((id) => timedEffects[type].has(id));
}

function getEntryTimedEffectIds(entry: ReforgedWorldbookEntry): string[] {
    return [
        entry.id,
        entry.uid === null ? '' : String(entry.uid),
    ].filter(Boolean);
}

function resolveTimedEffects(options: ReforgedChatLorebookContextOptions): ResolvedWorldbookTimedEffects {
    return {
        sticky: normalizeTimedEffectIds(options.timedEffects?.stickyEntryIds),
        cooldown: normalizeTimedEffectIds(options.timedEffects?.cooldownEntryIds),
    };
}

function resolveTokenBudget(options: ReforgedChatLorebookContextOptions): ResolvedWorldbookTokenBudget {
    return {
        countTokens: options.countTokens ?? countApproximateTokens,
        limit: resolveTokenBudgetLimit(options),
        overflowed: false,
        used: 0,
    };
}

function resolveTokenBudgetLimit(options: ReforgedChatLorebookContextOptions): number | null {
    if (options.includeInactivePreviewEntries || options.tokenBudget === null) {
        return null;
    }

    if (typeof options.tokenBudget === 'number' && Number.isFinite(options.tokenBudget)) {
        return Math.max(1, Math.floor(options.tokenBudget));
    }

    const contextTokenLimit = normalizeContextTokenLimit(options.contextTokenLimit);
    if (contextTokenLimit === null) {
        return null;
    }

    let limit = Math.round(resolveTokenBudgetPercent(options.tokenBudgetPercent) * contextTokenLimit / 100) || 1;
    const cap = normalizeTokenBudgetCap(options.tokenBudgetCap);
    if (cap > 0 && limit > cap) {
        limit = cap;
    }

    return limit;
}

function normalizeContextTokenLimit(value: number | null | undefined): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return null;
    }

    return Math.max(0, Math.floor(value));
}

function resolveTokenBudgetPercent(value: number | undefined): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 25;
    }

    if (value > 100) {
        return 25;
    }

    return Math.max(0, value);
}

function normalizeTokenBudgetCap(value: number | undefined): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 0;
    }

    return Math.max(0, Math.floor(value));
}

function wouldOverflowTokenBudget(tokenBudget: ResolvedWorldbookTokenBudget): boolean {
    return tokenBudget.limit !== null && tokenBudget.used >= tokenBudget.limit;
}

function countEntryTokens(
    entry: ReforgedWorldbookEntry,
    countTokens: ReforgedChatLorebookTokenCounter,
): number {
    const tokenCount = countTokens(entry.content.trim());
    if (!Number.isFinite(tokenCount)) {
        return 0;
    }

    return Math.max(0, Math.floor(tokenCount));
}

function countApproximateTokens(text: string): number {
    const normalizedText = text.trim();
    if (!normalizedText) {
        return 0;
    }

    return normalizedText.split(/\s+/u).length;
}

function normalizeTimedEffectIds(ids: string[] = []): Set<string> {
    return new Set(ids
        .map((id) => id.trim())
        .filter(Boolean));
}

function normalizeTimedEffectDuration(value: number | null): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return null;
    }

    const duration = Math.floor(value);
    return duration > 0 ? duration : null;
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

function normalizeMinimumActivations(value: number | undefined): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 0;
    }

    return Math.max(0, Math.floor(value));
}

function normalizeMinimumActivationsDepthMax(value: number | undefined): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 0;
    }

    return Math.max(0, Math.floor(value));
}

function resolveDefaultScanDepth(value: number | null | undefined): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return null;
    }

    return Math.floor(value);
}

function countScanChunks(context: LorebookScanContext): number {
    return context.messageTexts.length + (context.nextMessage ? 1 : 0);
}

function canAdvanceMinimumActivationScan(
    options: ReforgedChatLorebookContextOptions,
    scanDepthSkew: number,
    maxScanChunks: number,
    minimumActivationsDepthMax: number,
): boolean {
    const defaultScanDepth = resolveDefaultScanDepth(options.defaultScanDepth);
    if (defaultScanDepth === null) {
        return false;
    }

    const currentDepth = defaultScanDepth + scanDepthSkew;
    return !(
        (minimumActivationsDepthMax > 0 && currentDepth > minimumActivationsDepthMax) ||
        currentDepth > maxScanChunks
    );
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
