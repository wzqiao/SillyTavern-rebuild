import type { HeadlessGenerationRequest } from '@/contracts/engine';
import type { ReforgedPresetPrompt } from '@/contracts/preset';
import type {
    ReforgedChatEngineMessage,
    ReforgedChatGenerationOptions,
    ReforgedChatLorebookContext,
    ReforgedChatLorebookDepthContext,
    ReforgedChatLorebookEntryContext,
    ReforgedChatMessage,
    ReforgedChatPersonaContext,
    ReforgedChatSession,
} from '@/contracts/chat';
import { applyRegexScriptsToEngineMessages } from './regexScriptService';

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
    const presetPrompts = options.presetPrompts?.filter((prompt) => prompt.enabled) ?? [];

    if (presetPrompts.length > 0) {
        return applyRegexScriptsToEngineMessages(
            createPresetEngineMessages(session, allMessages, lorebooks, presetPrompts, options.persona),
            options.regexScripts,
        );
    }

    const engineMessages: ReforgedChatEngineMessage[] = [];
    const systemPrompt = createSystemPrompt(session, options, lorebooks);

    if (systemPrompt) {
        engineMessages.push({
            role: 'system',
            content: systemPrompt,
        });
    }

    appendSessionHistory(engineMessages, session, allMessages);

    return applyRegexScriptsToEngineMessages(engineMessages, options.regexScripts);
}

/**
 * 预设接管拼装(M2 阶段二):按 prompt_order 逐项产出消息。
 * marker 槽位映射当前上下文已有的数据;dialogueExamples / personaDescription
 * 等暂无数据来源的槽位跳过。绝对注入(injection_position=1)按顺序近似处理。
 */
function createPresetEngineMessages(
    session: ReforgedChatSession,
    allMessages: ReforgedChatMessage[],
    lorebooks: ReforgedChatLorebookContext[],
    prompts: ReforgedPresetPrompt[],
    persona?: ReforgedChatPersonaContext | null,
): ReforgedChatEngineMessage[] {
    const substituteMacros = createMacroSubstituter(session, persona);
    const engineMessages: ReforgedChatEngineMessage[] = [];

    const push = (role: ReforgedChatEngineMessage['role'], content: string): void => {
        const trimmed = content.trim();
        if (trimmed) {
            engineMessages.push({ role, content: trimmed });
        }
    };

    for (const prompt of prompts) {
        switch (prompt.identifier) {
            case 'chatHistory':
                appendSessionHistory(engineMessages, session, allMessages);
                break;
            case 'charDescription':
                push('system', substituteMacros(session.character?.description ?? ''));
                break;
            case 'charPersonality':
                push('system', substituteMacros(session.character?.personality ?? ''));
                break;
            case 'scenario':
                push('system', substituteMacros(session.character?.scenario ?? ''));
                break;
            case 'personaDescription':
                push('system', substituteMacros(persona?.description ?? ''));
                break;
            case 'dialogueExamples':
                for (const block of parseExampleBlocks(session.character?.exampleMessages, substituteMacros)) {
                    engineMessages.push({ role: 'system', content: block });
                }
                break;
            case 'worldInfoBefore':
                push('system', formatPresetLorebookBucket(lorebooks, 'before'));
                break;
            case 'worldInfoAfter':
                push('system', formatPresetLorebookBucket(lorebooks, 'after'));
                break;
            default:
                if (!prompt.marker) {
                    push(prompt.role, substituteMacros(prompt.content));
                }
                break;
        }
    }

    return engineMessages;
}

function appendSessionHistory(
    engineMessages: ReforgedChatEngineMessage[],
    session: ReforgedChatSession,
    allMessages: ReforgedChatMessage[],
): void {
    for (const message of readReforgedSessionMessages(session, allMessages)) {
        if (message.status === 'failed' || !message.content.trim()) {
            continue;
        }

        engineMessages.push({
            role: message.role,
            content: message.content,
        });
    }
}

function createMacroSubstituter(
    session: ReforgedChatSession,
    persona?: ReforgedChatPersonaContext | null,
): (text: string) => string {
    const characterName = session.character?.name?.trim() || 'Assistant';
    const userName = persona?.name?.trim() || 'User';

    return (text: string) => text
        .replace(/\{\{char\}\}/gi, characterName)
        .replace(/\{\{user\}\}/gi, userName);
}

// 旧版 mes_example 以 <START> 分块,每块是一段示例对话。
function parseExampleBlocks(
    raw: string | undefined,
    substituteMacros: (text: string) => string,
): string[] {
    const text = raw?.trim();

    if (!text) {
        return [];
    }

    return text
        .split(/<START>/gi)
        .map((block) => substituteMacros(block.trim()))
        .filter((block) => block.length > 0);
}

function formatPresetLorebookBucket(
    lorebooks: ReforgedChatLorebookContext[],
    bucket: 'before' | 'after',
): string {
    const sections: string[] = [];

    for (const lorebook of lorebooks) {
        const routed = hasRoutedLorebookEntries(lorebook);
        const entries: ReforgedChatLorebookEntryContext[] = [];

        if (bucket === 'before') {
            entries.push(...(lorebook.beforeEntries ?? (routed ? [] : lorebook.entries)));
        } else {
            entries.push(...(lorebook.afterEntries ?? []));
            // 预设槽位只有 before/after 两个世界书入口——
            // 其余路由桶并入 after,保证内容不因换拼装方式而丢失。
            entries.push(...(lorebook.authorNoteBeforeEntries ?? []));
            entries.push(...(lorebook.authorNoteAfterEntries ?? []));
            for (const depthEntry of lorebook.depthEntries ?? []) {
                entries.push(...depthEntry.entries);
            }
            for (const outletEntries of Object.values(lorebook.outletEntries ?? {})) {
                entries.push(...outletEntries);
            }
        }

        const content = formatEntryContents(entries);
        if (content) {
            sections.push(content);
        }
    }

    return sections.join('\n\n');
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
        createPersonaSystemPrompt(session, options.persona),
        createLorebookSystemPrompt(lorebooks),
    ].filter(Boolean).join('\n\n');
}

function createCharacterSystemPrompt(session: ReforgedChatSession): string {
    const character = session.character;
    if (!character) {
        return '';
    }

    const substituteMacros = createMacroSubstituter(session);
    const exampleBlocks = parseExampleBlocks(character.exampleMessages, substituteMacros);
    const sections = [
        `You are roleplaying as ${character.name}. Stay in character and continue the scene naturally.`,
        formatCharacterSection('Description', character.description),
        formatCharacterSection('Personality', character.personality),
        formatCharacterSection('Scenario', character.scenario),
        exampleBlocks.length > 0 ? `Example dialogue:\n${exampleBlocks.join('\n\n')}` : '',
    ].filter(Boolean);

    return sections.join('\n\n');
}

function createPersonaSystemPrompt(
    session: ReforgedChatSession,
    persona?: ReforgedChatPersonaContext | null,
): string {
    const description = persona?.description?.trim();

    if (!description) {
        return '';
    }

    const substituteMacros = createMacroSubstituter(session, persona);
    const userName = persona?.name?.trim() || 'User';
    return `About ${userName} (the user): ${substituteMacros(description)}`;
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
    if (hasRoutedLorebookEntries(lorebook)) {
        return formatRoutedLorebook(lorebook);
    }

    const entries = lorebook.entries
        .map((entry) => entry.content.trim())
        .filter(Boolean);

    if (entries.length === 0) {
        return '';
    }

    return [`Lorebook: ${lorebook.name}`, entries.join('\n\n')].join('\n\n');
}

function hasRoutedLorebookEntries(lorebook: ReforgedChatLorebookContext): boolean {
    return Boolean(
        lorebook.beforeEntries ||
        lorebook.afterEntries ||
        lorebook.authorNoteBeforeEntries ||
        lorebook.authorNoteAfterEntries ||
        lorebook.exampleEntries ||
        lorebook.depthEntries ||
        lorebook.outletEntries
    );
}

function formatRoutedLorebook(lorebook: ReforgedChatLorebookContext): string {
    const sections = [
        formatEntryBucket('Before character', lorebook.beforeEntries),
        formatEntryBucket('After character', lorebook.afterEntries),
        formatEntryBucket('Author note before', lorebook.authorNoteBeforeEntries),
        formatEntryBucket('Author note after', lorebook.authorNoteAfterEntries),
        formatDepthEntries(lorebook.depthEntries),
        formatOutletEntries(lorebook.outletEntries),
    ].filter(Boolean);

    return sections.length > 0 ? [`Lorebook: ${lorebook.name}`, ...sections].join('\n\n') : '';
}

function formatEntryBucket(label: string, entries: ReforgedChatLorebookEntryContext[] = []): string {
    const content = formatEntryContents(entries);
    return content ? `${label}:\n${content}` : '';
}

function formatDepthEntries(depthEntries: ReforgedChatLorebookDepthContext[] = []): string {
    const sections = depthEntries
        .map((depthEntry) => {
            const content = formatEntryContents(depthEntry.entries);
            return content ? `Depth ${depthEntry.depth} (${depthEntry.role}):\n${content}` : '';
        })
        .filter(Boolean);

    return sections.length > 0 ? ['Depth injections:', ...sections].join('\n\n') : '';
}

function formatOutletEntries(outletEntries: Record<string, ReforgedChatLorebookEntryContext[]> = {}): string {
    const sections = Object.entries(outletEntries)
        .map(([outletName, entries]) => {
            const content = formatEntryContents(entries);
            return content ? `Outlet ${outletName}:\n${content}` : '';
        })
        .filter(Boolean);

    return sections.length > 0 ? ['Outlet injections:', ...sections].join('\n\n') : '';
}

function formatEntryContents(entries: ReforgedChatLorebookEntryContext[]): string {
    return entries
        .map((entry) => entry.content.trim())
        .filter(Boolean)
        .join('\n\n');
}

function formatCharacterSection(label: string, value: string | undefined): string {
    const trimmed = value?.trim();
    return trimmed ? `${label}: ${trimmed}` : '';
}
