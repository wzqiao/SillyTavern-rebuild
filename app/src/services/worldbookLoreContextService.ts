import type {
    ReforgedChatLorebookContext,
    ReforgedChatMessageStatus,
} from '@/contracts/chat';
import type { ReforgedWorldbookEntry, ReforgedWorldbookLibraryItem } from '@/contracts/worldbook';

export interface ReforgedChatLorebookScanMessage {
    content: string;
    status?: ReforgedChatMessageStatus;
}

export interface ReforgedChatLorebookContextOptions {
    generationTrigger?: string;
    scanText?: string;
    messages?: ReforgedChatLorebookScanMessage[];
    nextMessage?: string;
}

export function createChatLorebookContext(
    libraryItem: ReforgedWorldbookLibraryItem,
    options: ReforgedChatLorebookContextOptions = {},
): ReforgedChatLorebookContext {
    const scanText = createLorebookScanText(options);

    return {
        id: libraryItem.id,
        name: libraryItem.worldbook.name,
        entries: libraryItem.worldbook.entries
            .map((entry, index) => ({ entry, index }))
            .filter(({ entry }) => shouldInjectEntry(entry, scanText, options))
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
): boolean {
    if (!entry.enabled || !entry.content.trim()) {
        return false;
    }

    if (!shouldMatchGenerationTrigger(entry, options.generationTrigger)) {
        return false;
    }

    if (entry.constant || !scanText) {
        return true;
    }

    const primaryMatched = matchesAnyKey(scanText, entry.primaryKeys, entry);
    if (!primaryMatched) {
        return false;
    }

    if (!entry.selective) {
        return true;
    }

    return matchesAnyKey(scanText, entry.secondaryKeys, entry);
}

function shouldMatchGenerationTrigger(
    entry: ReforgedWorldbookEntry,
    generationTrigger = 'normal',
): boolean {
    const trigger = generationTrigger.trim() || 'normal';
    const triggers = entry.triggers
        .map((trigger) => trigger.trim())
        .filter(Boolean);

    if (triggers.length === 0) {
        return true;
    }

    return triggers.includes(trigger);
}

function matchesAnyKey(scanText: string, keys: string[], entry: ReforgedWorldbookEntry): boolean {
    return keys
        .map((key) => key.trim())
        .filter(Boolean)
        .some((key) => matchesKey(scanText, key, entry));
}

function matchesKey(scanText: string, key: string, entry: ReforgedWorldbookEntry): boolean {
    const haystack = entry.caseSensitive ? scanText : scanText.toLocaleLowerCase();
    const needle = entry.caseSensitive ? key : key.toLocaleLowerCase();

    if (entry.matchWholeWords) {
        return matchesWholeWord(haystack, needle);
    }

    return haystack.includes(needle);
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
