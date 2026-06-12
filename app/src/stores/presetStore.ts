// DRAFT: 待主干评审

import { defineStore } from 'pinia';
import type {
    ReforgedPresetImportInput,
    ReforgedPresetImportResult,
    ReforgedPresetLibraryItem,
    ReforgedPresetPrompt,
    ReforgedPresetSampling,
} from '@/contracts/preset';
import { importPreset } from '@/services/presetImportService';

interface PresetStoreState {
    presets: ReforgedPresetLibraryItem[];
    selectedPresetId: string | null;
    lastImportResult: ReforgedPresetImportResult | null;
    nextLocalId: number;
}

export const usePresetStore = defineStore('preset', {
    state: (): PresetStoreState => ({
        presets: [],
        selectedPresetId: null,
        lastImportResult: null,
        nextLocalId: 1,
    }),

    getters: {
        selectedPreset(state): ReforgedPresetLibraryItem | null {
            return state.presets.find((preset) => preset.id === state.selectedPresetId) ?? null;
        },

        hasPresets(state): boolean {
            return state.presets.length > 0;
        },

        selectedSampling(): ReforgedPresetSampling | null {
            return this.selectedPreset?.preset.sampling ?? null;
        },

        selectedEnabledPrompts(): ReforgedPresetPrompt[] {
            return this.selectedPreset?.preset.prompts.filter((prompt) => prompt.enabled) ?? [];
        },
    },

    actions: {
        importPreset(input: ReforgedPresetImportInput, importedAt = new Date().toISOString()): ReforgedPresetImportResult {
            const result = importPreset(input);
            this.lastImportResult = result;

            if (!result.ok) {
                return result;
            }

            const libraryItem: ReforgedPresetLibraryItem = {
                id: createPresetItemId(result.preset.name, result.source.fileName, this.nextLocalId),
                preset: result.preset,
                source: result.source,
                importedAt,
                warnings: result.warnings,
            };

            this.presets.push(libraryItem);
            this.selectedPresetId = libraryItem.id;
            this.nextLocalId += 1;

            return result;
        },

        selectPreset(presetId: string | null): boolean {
            if (presetId === null) {
                this.selectedPresetId = null;
                return true;
            }

            if (!this.presets.some((preset) => preset.id === presetId)) {
                return false;
            }

            this.selectedPresetId = presetId;
            return true;
        },

        removePreset(presetId: string): boolean {
            const presetIndex = this.presets.findIndex((preset) => preset.id === presetId);

            if (presetIndex < 0) {
                return false;
            }

            this.presets.splice(presetIndex, 1);

            if (this.selectedPresetId === presetId) {
                this.selectedPresetId = null;
            }

            return true;
        },

        clearPresets(): void {
            this.presets = [];
            this.selectedPresetId = null;
            this.lastImportResult = null;
            this.nextLocalId = 1;
        },
    },
});

function createPresetItemId(presetName: string, fileName: string, localId: number): string {
    const slugSource = presetName || fileName || 'preset';
    const slug = slugSource
        .toLowerCase()
        .replace(/[^a-z0-9一-鿿]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'preset';

    return `preset-${slug}-${localId}`;
}
