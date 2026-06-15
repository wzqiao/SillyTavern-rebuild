import { defineStore } from 'pinia';
import type {
    ReforgedWorldbookImportInput,
    ReforgedWorldbookImportResult,
    ReforgedWorldbookLibraryItem,
} from '@/contracts/worldbook';
import { importWorldbook } from '@/services';

interface WorldbookStoreState {
    worldbooks: ReforgedWorldbookLibraryItem[];
    activeWorldbookIds: string[];
    /** Focused worldbook for preview/editor panes. Active lorebooks are multi-select. */
    selectedWorldbookId: string | null;
    lastImportResult: ReforgedWorldbookImportResult | null;
    nextLocalId: number;
}

export const useWorldbookStore = defineStore('worldbooks', {
    state: (): WorldbookStoreState => ({
        worldbooks: [],
        activeWorldbookIds: [],
        selectedWorldbookId: null,
        lastImportResult: null,
        nextLocalId: 1,
    }),

    getters: {
        selectedWorldbook(state): ReforgedWorldbookLibraryItem | null {
            return state.worldbooks.find((worldbook) => worldbook.id === state.selectedWorldbookId) ?? null;
        },

        activeWorldbooks(state): ReforgedWorldbookLibraryItem[] {
            const activeIds = new Set(state.activeWorldbookIds);
            return state.worldbooks.filter((worldbook) => activeIds.has(worldbook.id));
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
            if (!this.activeWorldbookIds.includes(libraryItem.id)) {
                this.activeWorldbookIds.push(libraryItem.id);
            }
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

        activateWorldbook(worldbookId: string): boolean {
            if (!this.worldbooks.some((worldbook) => worldbook.id === worldbookId)) {
                return false;
            }

            if (!this.activeWorldbookIds.includes(worldbookId)) {
                this.activeWorldbookIds.push(worldbookId);
            }
            this.selectedWorldbookId = worldbookId;
            return true;
        },

        deactivateWorldbook(worldbookId: string): boolean {
            if (!this.worldbooks.some((worldbook) => worldbook.id === worldbookId)) {
                return false;
            }

            this.activeWorldbookIds = this.activeWorldbookIds.filter((id) => id !== worldbookId);
            if (this.selectedWorldbookId === worldbookId) {
                this.selectedWorldbookId = this.activeWorldbookIds.at(-1)
                    ?? this.worldbooks.find((worldbook) => worldbook.id !== worldbookId)?.id
                    ?? null;
            }
            return true;
        },

        toggleWorldbookActive(worldbookId: string): boolean {
            return this.activeWorldbookIds.includes(worldbookId)
                ? this.deactivateWorldbook(worldbookId)
                : this.activateWorldbook(worldbookId);
        },

        selectOnlyWorldbook(worldbookId: string): boolean {
            if (!this.worldbooks.some((worldbook) => worldbook.id === worldbookId)) {
                return false;
            }

            this.activeWorldbookIds = [worldbookId];
            this.selectedWorldbookId = worldbookId;
            return true;
        },

        removeWorldbook(worldbookId: string): boolean {
            const worldbookIndex = this.worldbooks.findIndex((worldbook) => worldbook.id === worldbookId);

            if (worldbookIndex < 0) {
                return false;
            }

            this.worldbooks.splice(worldbookIndex, 1);
            this.activeWorldbookIds = this.activeWorldbookIds.filter((id) => id !== worldbookId);

            if (this.selectedWorldbookId === worldbookId) {
                this.selectedWorldbookId = this.activeWorldbookIds.at(-1)
                    ?? this.worldbooks.at(worldbookIndex - 1)?.id
                    ?? this.worldbooks[0]?.id
                    ?? null;
            }

            return true;
        },

        clearWorldbooks(): void {
            this.worldbooks = [];
            this.activeWorldbookIds = [];
            this.selectedWorldbookId = null;
            this.lastImportResult = null;
            this.nextLocalId = 1;
        },

        reconcileActiveWorldbooks(): void {
            const existingIds = new Set(this.worldbooks.map((worldbook) => worldbook.id));
            this.activeWorldbookIds = this.activeWorldbookIds.filter((id, index, ids) => (
                existingIds.has(id) && ids.indexOf(id) === index
            ));

            if (this.activeWorldbookIds.length === 0 && this.selectedWorldbookId && existingIds.has(this.selectedWorldbookId)) {
                this.activeWorldbookIds = [this.selectedWorldbookId];
            }

            if (this.selectedWorldbookId && !existingIds.has(this.selectedWorldbookId)) {
                this.selectedWorldbookId = this.activeWorldbookIds.at(-1) ?? this.worldbooks[0]?.id ?? null;
            }
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
