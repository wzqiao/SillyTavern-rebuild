import type { HeadlessGenerationRequest } from '@/contracts/engine';
import type {
    ReforgedChatEngineMessage,
    ReforgedChatGenerationOptions,
    ReforgedChatLorebookContext,
    ReforgedChatMessage,
    ReforgedChatSession,
} from '@/contracts/chat';

// DRAFT: 待主干评审
export interface ReforgedChatGenerationRequestInput {
    session: ReforgedChatSession;
    messages: ReforgedChatMessage[];
    lorebooks?: ReforgedChatLorebookContext[];
    generation?: ReforgedChatGenerationOptions;
}

export function createChatGenerationRequest(input: ReforgedChatGenerationRequestInput): HeadlessGenerationRequest {
    const options = input.generation ?? {};

    return {
        prompt: createChatEngineMessages(input.session, input.messages, options, input.lorebooks),
        api: options.api,
        instructOverride: options.instructOverride,
        quietToLoud: options.quietToLoud,
        responseLength: options.responseLength,
        trimNames: options.trimNames ?? true,
        prefill: options.prefill,
        jsonSchema: options.jsonSchema ?? null,
    };
}

export function createChatEngineMessages(
    session: ReforgedChatSession,
    allMessages: ReforgedChatMessage[],
    options: ReforgedChatGenerationOptions = {},
    lorebooks: ReforgedChatLorebookContext[] = [],
): ReforgedChatEngineMessage[] {
    const engineMessages: ReforgedChatEngineMessage[] = [];
    const systemPrompt = createSystemPrompt(session, options, lorebooks);

    if (systemPrompt) {
        engineMessages.push({
            role: 'system',
            content: systemPrompt,
        });
    }

    for (const message of readReforgedSessionMessages(session, allMessages)) {
        if (message.status === 'failed' || !message.content.trim()) {
            continue;
        }

        engineMessages.push({
            role: message.role,
            content: message.content,
        });
    }

    return engineMessages;
}

export function readReforgedSessionMessages(
    session: ReforgedChatSession,
    allMessages: ReforgedChatMessage[],
): ReforgedChatMessage[] {
    return session.messageIds
        .map((id) => allMessages.find((message) => message.id === id))
        .filter((message): message is ReforgedChatMessage => Boolean(message));
}

function createSystemPrompt(
    session: ReforgedChatSession,
    options: ReforgedChatGenerationOptions,
    lorebooks: ReforgedChatLorebookContext[],
): string {
    return [
        options.systemPrompt?.trim() || createCharacterSystemPrompt(session),
        createLorebookSystemPrompt(lorebooks),
    ].filter(Boolean).join('\n\n');
}

function createCharacterSystemPrompt(session: ReforgedChatSession): string {
    const character = session.character;
    if (!character) {
        return '';
    }

    const sections = [
        `You are roleplaying as ${character.name}. Stay in character and continue the scene naturally.`,
        formatCharacterSection('Description', character.description),
        formatCharacterSection('Personality', character.personality),
        formatCharacterSection('Scenario', character.scenario),
    ].filter(Boolean);

    return sections.join('\n\n');
}

function createLorebookSystemPrompt(lorebooks: ReforgedChatLorebookContext[]): string {
    const lorebookSections = lorebooks
        .map((lorebook) => formatLorebook(lorebook))
        .filter(Boolean);

    if (lorebookSections.length === 0) {
        return '';
    }

    return [
        'World lore context:',
        'Use these selected lore notes as additional scene context.',
        ...lorebookSections,
    ].join('\n\n');
}

function formatLorebook(lorebook: ReforgedChatLorebookContext): string {
    const entries = lorebook.entries
        .map((entry) => entry.content.trim())
        .filter(Boolean);

    if (entries.length === 0) {
        return '';
    }

    return [`Lorebook: ${lorebook.name}`, entries.join('\n\n')].join('\n\n');
}

function formatCharacterSection(label: string, value: string | undefined): string {
    const trimmed = value?.trim();
    return trimmed ? `${label}: ${trimmed}` : '';
}
