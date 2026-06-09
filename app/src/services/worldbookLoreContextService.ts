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

interface ResolvedWorldbookMatchSettings {
    caseSensitive: boolean;
    matchWholeWords: boolean;
}

interface ReforgedWorldbookEntryCandidate {
    entry: ReforgedWorldbookEntry;
    index: number;
}

export interface ReforgedChatLorebookScanMessage {
    content: string;
    status?: ReforgedChatMessageStatus;
}

export interface ReforgedChatLorebookContextOptions {
    defaultCaseSensitive?: boolean;
    defaultMatchWholeWords?: boolean;
    generationTrigger?: string;
    includeInactivePreviewEntries?: boolean;
    random?: () => number;
    scanText?: string;
    messages?: ReforgedChatLorebookScanMessage[];
    nextMessage?: string;
}

export function createChatLorebookContext(
    libraryItem: ReforgedWorldbookLibraryItem,
    options: ReforgedChatLorebookContextOptions = {},
): ReforgedChatLorebookContext {
    const scanText = createLorebookScanText(options);
    const matchSettings = resolveMatchSettings(options);
    const candidates = libraryItem.worldbook.entries
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => shouldInjectEntry(entry, scanText, options, matchSettings));

    return {
        id: libraryItem.id,
        name: libraryItem.worldbook.name,
        entries: filterInclusionGroups(candidates, options)
            .filter(({ entry }) => shouldPassProbability(entry, options))
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

function createLorebookScanText(options: ReforgedChatLorebookContextOptions): string {
    if (options.scanText !== undefined) {
        return options.scanText.trim();
    }

    return [
        ...(options.messages ?? [])
            .filter((message) => message.status !== 'failed')
            .map((message) => message.content.trim())
            .filter(Boolean),
        options.nextMessage?.trim() ?? '',
    ].filter(Boolean).join('\n');
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
