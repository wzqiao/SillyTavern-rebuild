import { defineStore } from 'pinia';
import type { ReforgedChatPersonaContext } from '@/contracts/chat';

interface PersonaStoreState {
    name: string;
    description: string;
}

export const usePersonaStore = defineStore('persona', {
    state: (): PersonaStoreState => ({
        name: '',
        description: '',
    }),

    getters: {
        /** 聊天气泡与 {{user}} 宏使用;空串表示沿用默认文案。 */
        displayName(state): string {
            return state.name.trim();
        },

        persona(state): ReforgedChatPersonaContext {
            return {
                name: state.name,
                description: state.description,
            };
        },
    },

    actions: {
        patchPersona(input: Partial<PersonaStoreState>): void {
            if (input.name !== undefined) {
                this.name = input.name;
            }

            if (input.description !== undefined) {
                this.description = input.description;
            }
        },

        clearPersona(): void {
            this.name = '';
            this.description = '';
        },
    },
});
