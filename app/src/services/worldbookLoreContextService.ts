import type { ReforgedChatLorebookContext } from '@/contracts/chat';
import type { ReforgedWorldbookLibraryItem } from '@/contracts/worldbook';

export function createChatLorebookContext(libraryItem: ReforgedWorldbookLibraryItem): ReforgedChatLorebookContext {
    return {
        id: libraryItem.id,
        name: libraryItem.worldbook.name,
        entries: libraryItem.worldbook.entries
            .map((entry, index) => ({ entry, index }))
            .filter(({ entry }) => entry.enabled && entry.content.trim())
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
