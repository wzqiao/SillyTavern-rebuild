import { defineStore } from 'pinia';
import type {
    ReforgedCharacterImportInput,
    ReforgedCharacterImportResult,
    ReforgedCharacterRosterItem,
} from '@/contracts/character';
import { importCharacterCard } from '@/services';

interface CharacterStoreState {
    characters: ReforgedCharacterRosterItem[];
    selectedCharacterId: string | null;
    lastImportResult: ReforgedCharacterImportResult | null;
    nextLocalId: number;
}

export const useCharacterStore = defineStore('characters', {
    state: (): CharacterStoreState => ({
        characters: [],
        selectedCharacterId: null,
        lastImportResult: null,
        nextLocalId: 1,
    }),

    getters: {
        selectedCharacter(state): ReforgedCharacterRosterItem | null {
            return state.characters.find((character) => character.id === state.selectedCharacterId) ?? null;
        },

        hasCharacters(state): boolean {
            return state.characters.length > 0;
        },
    },

    actions: {
        importCharacter(input: ReforgedCharacterImportInput, importedAt = new Date().toISOString()): ReforgedCharacterImportResult {
            const result = importCharacterCard(input);
            this.lastImportResult = result;

            if (!result.ok) {
                return result;
            }

            const rosterItem: ReforgedCharacterRosterItem = {
                id: createRosterItemId(result.card.name, result.source.fileName, this.nextLocalId),
                card: result.card,
                source: result.source,
                importedAt,
                warnings: result.warnings,
            };

            this.characters.push(rosterItem);
            this.selectedCharacterId = rosterItem.id;
            this.nextLocalId += 1;

            return result;
        },

        selectCharacter(characterId: string): boolean {
            if (!this.characters.some((character) => character.id === characterId)) {
                return false;
            }

            this.selectedCharacterId = characterId;
            return true;
        },

        removeCharacter(characterId: string): boolean {
            const characterIndex = this.characters.findIndex((character) => character.id === characterId);

            if (characterIndex < 0) {
                return false;
            }

            this.characters.splice(characterIndex, 1);

            if (this.selectedCharacterId === characterId) {
                this.selectedCharacterId = this.characters.at(characterIndex - 1)?.id ?? this.characters[0]?.id ?? null;
            }

            return true;
        },

        clearCharacters(): void {
            this.characters = [];
            this.selectedCharacterId = null;
            this.lastImportResult = null;
            this.nextLocalId = 1;
        },
    },
});

function createRosterItemId(characterName: string, fileName: string, localId: number): string {
    const baseName = `${characterName}-${fileName}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return `${baseName || 'character'}-${localId}`;
}
