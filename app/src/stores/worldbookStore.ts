import { defineStore } from 'pinia';
import type {
    ReforgedWorldbookImportInput,
    ReforgedWorldbookImportResult,
    ReforgedWorldbookLibraryItem,
} from '@/contracts/worldbook';
import { importWorldbook } from '@/services';

interface WorldbookStoreState {
    worldbooks: ReforgedWorldbookLibraryItem[];
    selectedWorldbookId: string | null;
    lastImportResult: ReforgedWorldbookImportResult | null;
    nextLocalId: number;
}

export const useWorldbookStore = defineStore('worldbooks', {
    state: (): WorldbookStoreState => ({
        worldbooks: [],
        selectedWorldbookId: null,
        lastImportResult: null,
        nextLocalId: 1,
    }),

    getters: {
        selectedWorldbook(state): ReforgedWorldbookLibraryItem | null {
            return state.worldbooks.find((worldbook) => worldbook.id === state.selectedWorldbookId) ?? null;
        },

        hasWorldbooks(state): boolean {
            return state.worldbooks.length > 0;
        },
    },

    actions: {
        importWorldbook(input: ReforgedWorldbookImportInput, importedAt = new Date().toISOString()): ReforgedWorldbookImportResult {
            const result = importWorldbook(input);
            this.lastImportResult = result;

            if (!result.ok) {
                return result;
            }

            const libraryItem: ReforgedWorldbookLibraryItem = {
                id: createWorldbookItemId(result.worldbook.name, result.source.fileName, this.nextLocalId),
                worldbook: result.worldbook,
                source: result.source,
                importedAt,
                warnings: result.warnings,
            };

            this.worldbooks.push(libraryItem);
            this.selectedWorldbookId = libraryItem.id;
            this.nextLocalId += 1;

            return result;
        },

        selectWorldbook(worldbookId: string): boolean {
            if (!this.worldbooks.some((worldbook) => worldbook.id === worldbookId)) {
                return false;
            }

            this.selectedWorldbookId = worldbookId;
            return true;
        },

        removeWorldbook(worldbookId: string): boolean {
            const worldbookIndex = this.worldbooks.findIndex((worldbook) => worldbook.id === worldbookId);

            if (worldbookIndex < 0) {
                return false;
            }

            this.worldbooks.splice(worldbookIndex, 1);

            if (this.selectedWorldbookId === worldbookId) {
                this.selectedWorldbookId = this.worldbooks.at(worldbookIndex - 1)?.id ?? this.worldbooks[0]?.id ?? null;
            }

            return true;
        },

        clearWorldbooks(): void {
            this.worldbooks = [];
            this.selectedWorldbookId = null;
            this.lastImportResult = null;
            this.nextLocalId = 1;
        },
    },
});

function createWorldbookItemId(worldbookName: string, fileName: string, localId: number): string {
    const baseName = `${worldbookName}-${fileName}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return `${baseName || 'worldbook'}-${localId}`;
}
