<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { createChatLorebookContext } from '@/services';
import MultiplayerRoomPanel from '@/components/MultiplayerRoomPanel.vue';
import { parseChatJsonl } from '@/parsers/chatJsonl';
import { useCharacterStore, useChatStore, useConnectionStore, useMultiplayerStore, usePersonaStore, usePresetStore, useWorldbookStore } from '@/stores';
import { Button, Drawer, ListItem, Spinner, Textarea } from '@/ui-kit';
import { useI18n } from '@/i18n';
import type { ReforgedCharacterRosterItem } from '@/contracts/character';
import type {
    ReforgedChatCharacterContext,
    ReforgedChatMessage,
    ReforgedChatSession,
    ReforgedChatRuntimeConnectionProvider,
    ReforgedChatSendInput,
} from '@/contracts/chat';
import type {
    ReforgedConnectionRuntimeHandoffIssue,
    ReforgedConnectionRuntimeHandoffIssueCode,
    ReforgedConnectionRuntimeHandoffStatus,
} from '@/contracts/connection';
import type { EngineAdapterDiagnostics, HeadlessEngineAdapter, HeadlessGenerationRequest } from '@/contracts/engine';

type AdapterMode = 'demo' | 'runtime';
type ChatGenerationTrigger = 'normal' | 'continue';
type ChatActionKind = 'regenerate' | 'continue' | 'retry';
type RuntimeChatCompletionType = NonNullable<ReforgedChatSendInput['runtime']>['chatCompletionType'];
type ChatActionInput = Omit<ReforgedChatSendInput, 'content' | 'sessionId'>;
interface RuntimeActivationOptions {
    inspectRuntime?: boolean;
}

const characterStore = useCharacterStore();
const chatStore = useChatStore();
const connectionStore = useConnectionStore();
const multiplayerStore = useMultiplayerStore();
const personaStore = usePersonaStore();
const presetStore = usePresetStore();
const worldbookStore = useWorldbookStore();
const { t, locale } = useI18n();

const adapterMode = ref<AdapterMode>('demo');
const composer = ref('');
const runtimeBusy = ref(false);
const runtimeNotice = ref<string | null>(null);
const runtimeFallbackNotice = ref<string | null>(null);
const runtimeDiagnostics = ref<EngineAdapterDiagnostics | null>(null);
const sendNotice = ref<string | null>(null);
const timeline = ref<HTMLElement | null>(null);
const sessionDrawerOpen = ref(false);
const legacyChatInput = ref<HTMLInputElement | null>(null);

function triggerLegacyChatImport(): void {
    legacyChatInput.value?.click();
}

async function handleLegacyChatFile(event: Event): Promise<void> {
    const inputElement = event.target as HTMLInputElement;
    const file = inputElement.files?.[0];
    inputElement.value = '';

    if (!file) {
        return;
    }

    try {
        const parsed = parseChatJsonl(await file.text());
        const rosterMatch = parsed.characterName
            ? characterStore.characters.find((item) => item.card.name === parsed.characterName)
            : null;
        const character = rosterMatch ? toChatCharacter(rosterMatch) : null;
        const session = chatStore.importLegacySession(parsed, { character });
        const missingCharacterNote = !character && parsed.characterName
            ? ` ${t.value.chat.importLegacy.noCharacter(parsed.characterName)}`
            : '';
        sendNotice.value = t.value.chat.importLegacy.success(session.title, parsed.messages.length) + missingCharacterNote;
        sessionDrawerOpen.value = false;
    } catch (error) {
        sendNotice.value = t.value.chat.importLegacy.failed(error instanceof Error ? error.message : String(error));
    }
}
const editingMessageId = ref<string | null>(null);
const editingContent = ref('');
const confirmingDeleteMessageId = ref<string | null>(null);
const pendingActionMessageId = ref<string | null>(null);
const pendingActionKind = ref<ChatActionKind | null>(null);
let demoReplyLocalId = 1;

const demoAdapter: HeadlessEngineAdapter = {
    inspect: async () => ({
        ok: true,
        checkedAt: new Date().toISOString(),
        environment: {
            hasDocument: true,
            hasJQuery: false,
            hasToastr: false,
            hasAbortController: true,
            hasReadableStream: true,
            locationHref: globalThis.location?.href,
            userAgent: globalThis.navigator?.userAgent,
        },
        capabilities: [],
        probes: [],
        warnings: ['Demo adapter returns local replies and does not contact SillyTavern runtime.'],
        blockers: [],
    }),
    generateText: async (request) => {
        await delay(850);
        return createDemoReply(request, demoReplyLocalId++);
    },
    generateRawData: async () => ({ mode: 'demo' }),
    sendChatCompletion: async () => ({ mode: 'demo' }),
};

const selectedCharacter = computed(() => characterStore.selectedCharacter);
const selectedWorldbook = computed(() => worldbookStore.selectedWorldbook);
const activeSession = computed(() => chatStore.selectedSession);
const isRoomMode = computed(() => multiplayerStore.isConnected);
const messages = computed(() => isRoomMode.value ? multiplayerStore.chatMessages : chatStore.selectedMessages);
const sortedSessions = computed(() => [...chatStore.sessions].sort((left, right) => (
    new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
)));
const readiness = computed(() => chatStore.readiness);
const runtimeAdapterReady = computed(() => (
    adapterMode.value === 'runtime' &&
    readiness.value.hasAdapter &&
    runtimeDiagnostics.value?.ok !== false
));
const runtimeDirectRequestReady = computed(() => (
    runtimeAdapterReady.value &&
    chatStore.engineAdapter?.supportsDirectBackendChatCompletion === true &&
    connectionStore.hasAppliedDraft
));
const runtimeHandoff = computed(() => connectionStore.runtimeHandoff({
    runtimeAdapterReady: runtimeAdapterReady.value,
    runtimeDirectRequestReady: runtimeDirectRequestReady.value,
}));
const canAttemptRuntime = computed(() => adapterMode.value !== 'runtime' || runtimeHandoff.value.canAttempt);
const isGenerationBusy = computed(() => (
    isRoomMode.value
        ? multiplayerStore.activeGenerations.length > 0
        : chatStore.isGenerating
));
const canSend = computed(() => (
    composer.value.trim().length > 0 &&
    (
        isRoomMode.value
            ? multiplayerStore.socketConnected
            : readiness.value.canSend && canAttemptRuntime.value && !chatStore.isGenerating
    )
));
const characterName = computed(() => selectedCharacter.value?.card.name ?? '');
const headerTitle = computed(() => (
    multiplayerStore.room?.title ||
    activeSession.value?.title ||
    selectedCharacter.value?.card.name ||
    t.value.chat.openChat
));
const statusMessage = computed(() => {
    if (isRoomMode.value) {
        if (multiplayerStore.activeGenerations.length > 0) {
            return t.value.chat.generatingReply;
        }

        return multiplayerStore.keyState?.hasKey
            ? `多人房间就绪 · ${multiplayerStore.participants.length} 人`
            : '多人房间已连接，填入你的 API Key 后可触发生成。';
    }

    if (chatStore.isGenerating) {
        return t.value.chat.generatingReply;
    }

    if (sendNotice.value) {
        return sendNotice.value;
    }

    if (adapterMode.value === 'runtime') {
        return runtimeNotice.value ?? translateRuntimeStatus(runtimeHandoff.value.status);
    }

    return readiness.value.canSend ? t.value.chat.demoReady : readiness.value.reason?.message ?? t.value.chat.demoReady;
});
const runtimeIssueLines = computed(() => [
    ...runtimeHandoff.value.issues.map((issue) => translateRuntimeIssue(issue)),
    ...(runtimeDiagnostics.value?.blockers ?? []),
    ...(runtimeDiagnostics.value?.warnings ?? []),
].slice(0, 4));
const lorebookContext = computed(() => selectedWorldbook.value
    ? createChatLorebookContext(selectedWorldbook.value, {
        generationTrigger: 'normal',
        includeInactivePreviewEntries: true,
        messages: messages.value,
        nextMessage: composer.value,
    })
    : null);
const lorebookEntryCount = computed(() => lorebookContext.value?.entries.length ?? 0);

onMounted(async () => {
    window.addEventListener('reforged-transport-fallback', handleTransportFallback);
    selectDemoAdapter();
    if (connectionStore.hasAppliedDraft) {
        await activateRuntimeAdapter();

        if (runtimeDiagnostics.value?.ok === false || !runtimeHandoff.value.canAttempt) {
            const reason = runtimeIssueLines.value[0] ?? runtimeNotice.value ?? t.value.chat.runtimeDiagFailed;
            selectDemoAdapter({ preserveFallbackNotice: true });
            runtimeFallbackNotice.value = t.value.chat.runtimeFallback(reason);
        }
    }
    autoStartSession();
});

onBeforeUnmount(() => {
    window.removeEventListener('reforged-transport-fallback', handleTransportFallback);
});

watch(
    () => selectedCharacter.value?.id,
    () => {
        autoStartSession();
    },
);

watch(
    () => [
        messages.value.length,
        chatStore.generation.status,
        chatStore.generation.assistantMessageId,
        messages.value.at(-1)?.content,
    ],
    async () => {
        await nextTick();
        timeline.value?.scrollTo({
            top: timeline.value.scrollHeight,
            behavior: 'smooth',
        });
    },
);

watch(
    () => [
        connectionStore.appliedDraft?.id,
        connectionStore.draft.baseUrl,
        connectionStore.draft.model,
        connectionStore.draft.apiKey.hasValue,
    ],
    () => {
        if (adapterMode.value === 'runtime') {
            runtimeNotice.value = translateRuntimeStatus(runtimeHandoff.value.status);
        }
    },
    { flush: 'sync' },
);

function autoStartSession(): void {
    if (!selectedCharacter.value || activeSession.value) {
        return;
    }

    startCharacterSession();
}

function handleTransportFallback(event: Event): void {
    const detail = event instanceof CustomEvent && isRecord(event.detail) ? event.detail : {};
    const reason = typeof detail.reason === 'string' ? detail.reason : t.value.chat.runtimeDiagFailed;
    runtimeFallbackNotice.value = t.value.chat.transportFallback(reason);
}

function selectDemoAdapter(options: { preserveFallbackNotice?: boolean } = {}): void {
    adapterMode.value = 'demo';
    runtimeBusy.value = false;
    runtimeNotice.value = null;
    runtimeDiagnostics.value = null;
    sendNotice.value = null;
    if (!options.preserveFallbackNotice) {
        runtimeFallbackNotice.value = null;
    }
    chatStore.setEngineAdapter(demoAdapter);
}

async function activateRuntimeAdapter(options: RuntimeActivationOptions = {}): Promise<void> {
    adapterMode.value = 'runtime';
    runtimeBusy.value = true;
    runtimeNotice.value = t.value.chat.runtimeChecking;
    runtimeFallbackNotice.value = null;
    runtimeDiagnostics.value = null;
    sendNotice.value = null;
    chatStore.setEngineAdapter(null);

    try {
        const { loadHeadlessEngineAdapter } = await import('@/engine-adapter/runtimeAdapterLoader');
        const runtimeAdapter = await loadHeadlessEngineAdapter();

        if (options.inspectRuntime) {
            const diagnostics = await runtimeAdapter.inspect({ probeContext: true });
            runtimeDiagnostics.value = diagnostics;

            if (!diagnostics.ok) {
                runtimeNotice.value = diagnostics.blockers[0] ?? t.value.chat.runtimeDiagFailed;
                return;
            }
        }

        chatStore.setEngineAdapter(runtimeAdapter);
        const handoff = connectionStore.runtimeHandoff({
            runtimeAdapterReady: true,
            runtimeDirectRequestReady: runtimeAdapter.supportsDirectBackendChatCompletion === true && connectionStore.hasAppliedDraft,
        });
        runtimeNotice.value = translateRuntimeStatus(handoff.status);
    } catch (error) {
        runtimeNotice.value = t.value.chat.runtimeLoadFailed(describeError(error));
        chatStore.setEngineAdapter(null);
    } finally {
        runtimeBusy.value = false;
    }
}

function startCharacterSession(): void {
    if (!selectedCharacter.value) {
        return;
    }

    const existingSession = chatStore.sessions.find((session) => session.character?.id === selectedCharacter.value?.id);
    if (existingSession) {
        chatStore.selectSession(existingSession.id);
        return;
    }

    chatStore.startSession({
        character: toChatCharacter(selectedCharacter.value),
    }, new Date().toISOString());
}

function startFreshSession(): void {
    const character = selectedCharacter.value
        ? toChatCharacter(selectedCharacter.value)
        : activeSession.value?.character ?? null;

    chatStore.startSession({ character }, new Date().toISOString());
    sessionDrawerOpen.value = false;
}

function selectChatSession(sessionId: string): void {
    if (chatStore.selectSession(sessionId)) {
        sessionDrawerOpen.value = false;
        confirmingDeleteMessageId.value = null;
        cancelEdit();
    }
}

function removeChatSession(session: ReforgedChatSession): void {
    if (chatStore.isGenerating) {
        return;
    }

    if (chatStore.removeSession(session.id)) {
        sendNotice.value = t.value.chat.sessionDeleted(formatSessionTitle(session));
    }
}

async function sendMessage(): Promise<void> {
    const content = composer.value.trim();
    if (!content || isGenerationBusy.value) {
        return;
    }

    if (isRoomMode.value) {
        composer.value = '';
        multiplayerStore.sendChatMessageAndGenerate(content);
        if (multiplayerStore.lastError) {
            composer.value = content;
            sendNotice.value = multiplayerStore.lastError.message;
        }
        return;
    }

    const generationInput = createGenerationInput({
        trigger: 'normal',
        contextMessages: messages.value,
        nextMessage: content,
        runtimeType: 'quiet',
    });
    if (!generationInput) {
        return;
    }

    composer.value = '';
    const result = await chatStore.sendUserMessage({
        content,
        ...generationInput,
    });

    if (!result.ok) {
        composer.value = content;
        sendNotice.value = result.error.message;
    }
}

function stopGeneration(): void {
    if (isRoomMode.value) {
        multiplayerStore.cancelActiveGeneration();
        return;
    }

    chatStore.cancelGeneration();
}

function createGenerationInput(options: {
    trigger: ChatGenerationTrigger;
    contextMessages: ReforgedChatMessage[];
    nextMessage: string;
    runtimeType?: RuntimeChatCompletionType;
}): ChatActionInput | null {
    sendNotice.value = null;
    let runtimeConnectionProvider: ReforgedChatRuntimeConnectionProvider | null = null;
    const handoff = adapterMode.value === 'runtime'
        ? connectionStore.runtimeHandoff({
            runtimeAdapterReady: runtimeAdapterReady.value,
            runtimeDirectRequestReady: runtimeDirectRequestReady.value,
        })
        : runtimeHandoff.value;

    if (adapterMode.value === 'runtime') {
        if (!handoff.canAttempt) {
            runtimeNotice.value = handoff.message;
            return null;
        }

        runtimeConnectionProvider = handoff.takeRuntimeConnection;
        if (!runtimeConnectionProvider) {
            runtimeNotice.value = t.value.chat.runtimeKeyGone;
            return null;
        }
    }

    const lorebooks = selectedWorldbook.value
        ? [createChatLorebookContext(selectedWorldbook.value, {
            generationTrigger: options.trigger,
            messages: options.contextMessages,
            nextMessage: options.nextMessage,
        })]
        : [];
    const character = selectedCharacter.value
        ? toChatCharacter(selectedCharacter.value)
        : activeSession.value?.character ?? null;

    return {
        character,
        lorebooks,
        runtime: {
            mode: adapterMode.value === 'runtime' ? 'chat-completion' : 'generate-text',
            chatCompletionType: adapterMode.value === 'runtime' ? options.runtimeType : undefined,
        },
        runtimeConnectionProvider,
        generation: {
            api: handoff.generation.api,
            responseLength: presetStore.selectedSampling?.maxTokens ?? 220,
            sampling: presetStore.selectedSampling,
            presetPrompts: presetStore.selectedEnabledPrompts.length > 0
                ? presetStore.selectedEnabledPrompts
                : null,
            persona: personaStore.persona,
        },
    };
}

async function runAssistantAction(message: ReforgedChatMessage, kind: ChatActionKind): Promise<void> {
    if (!canRunMessageAction(message)) {
        return;
    }

    confirmingDeleteMessageId.value = null;
    const isContinue = kind === 'continue';
    const contextMessages = readMessagesThrough(message, isContinue);
    const nextMessage = isContinue
        ? message.content
        : findPreviousUserMessage(message)?.content ?? message.content;
    const generationInput = createGenerationInput({
        trigger: isContinue ? 'continue' : 'normal',
        contextMessages,
        nextMessage,
        runtimeType: isContinue ? 'continue' : 'quiet',
    });
    if (!generationInput) {
        return;
    }

    pendingActionMessageId.value = message.id;
    pendingActionKind.value = kind;

    try {
        const result = kind === 'continue'
            ? await chatStore.continueAssistantMessage(message.id, generationInput)
            : kind === 'retry'
                ? await chatStore.retryFailedAssistantMessage(message.id, generationInput)
                : await chatStore.regenerateAssistantMessage(message.id, generationInput);

        if (!result.ok) {
            sendNotice.value = result.error.message;
        }
    } finally {
        pendingActionMessageId.value = null;
        pendingActionKind.value = null;
    }
}

function beginEdit(message: ReforgedChatMessage): void {
    if (!canRunMessageAction(message)) {
        return;
    }

    editingMessageId.value = message.id;
    editingContent.value = message.content;
    confirmingDeleteMessageId.value = null;
}

function saveEdit(message: ReforgedChatMessage): void {
    if (chatStore.isGenerating) {
        return;
    }

    if (chatStore.editMessage(message.id, editingContent.value)) {
        editingMessageId.value = null;
        editingContent.value = '';
        sendNotice.value = message.role === 'user' ? t.value.chat.userUpdated : null;
    }
}

function cancelEdit(): void {
    editingMessageId.value = null;
    editingContent.value = '';
}

function deleteChatMessage(message: ReforgedChatMessage): void {
    if (!canRunMessageAction(message)) {
        return;
    }

    if (confirmingDeleteMessageId.value !== message.id) {
        confirmingDeleteMessageId.value = message.id;
        sendNotice.value = t.value.chat.confirmDelete;
        return;
    }

    if (chatStore.deleteMessage(message.id)) {
        if (editingMessageId.value === message.id) {
            cancelEdit();
        }
        confirmingDeleteMessageId.value = null;
        sendNotice.value = t.value.chat.deleted;
    }
}

function selectSwipe(message: ReforgedChatMessage, index: number): void {
    if (!canRunMessageAction(message)) {
        return;
    }

    confirmingDeleteMessageId.value = null;
    chatStore.selectAssistantSwipe(message.id, index);
}

function shiftSwipe(message: ReforgedChatMessage, delta: number): void {
    selectSwipe(message, message.activeAlternativeIndex + delta);
}

function canRunMessageAction(message: ReforgedChatMessage): boolean {
    return (
        !isRoomMode.value &&
        !chatStore.isGenerating &&
        !pendingActionMessageId.value &&
        message.status !== 'generating'
    );
}

function isMessageActionPending(message: ReforgedChatMessage, kind?: ChatActionKind): boolean {
    return (
        pendingActionMessageId.value === message.id &&
        (!kind || pendingActionKind.value === kind)
    );
}

function readMessagesThrough(message: ReforgedChatMessage, includeTarget: boolean): ReforgedChatMessage[] {
    const index = messages.value.findIndex((item) => item.id === message.id);
    if (index < 0) {
        return messages.value;
    }

    return messages.value.slice(0, index + (includeTarget ? 1 : 0));
}

function findPreviousUserMessage(message: ReforgedChatMessage): ReforgedChatMessage | null {
    const index = messages.value.findIndex((item) => item.id === message.id);
    if (index < 0) {
        return null;
    }

    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        const candidate = messages.value[cursor];
        if (candidate?.role === 'user') {
            return candidate;
        }
    }

    return null;
}

function messageRoleLabel(message: ReforgedChatMessage): string {
    if (isRoomMode.value) {
        return multiplayerStore.participantNameById(message.authorId ?? (message.role === 'assistant' ? 'assistant' : 'system'));
    }

    if (message.role === 'user') {
        return personaStore.displayName || t.value.chat.roleUser;
    }

    return characterName.value || t.value.chat.roleAssistant;
}

function messageBubbleClass(message: ReforgedChatMessage): string {
    const base = 'message-bubble max-w-[min(40rem,90%)] rounded-lg px-4 py-3 text-sm leading-7 shadow-[0_14px_40px_rgba(0,0,0,0.28)]';
    const role = message.role === 'user'
        ? 'ml-auto border border-cyan-200/35 bg-cyan-200/14 text-cyan-50'
        : 'mr-auto border border-white/10 bg-neutral-950/68 text-neutral-100';
    const state = message.status === 'failed' ? 'ring-2 ring-rose-400/70' : '';
    const live = message.status === 'generating' ? 'signal-glow' : '';

    return [base, role, state, live].filter(Boolean).join(' ');
}

function formatMessageStatus(message: ReforgedChatMessage): string {
    if (message.status === 'generating') {
        return t.value.chat.streaming;
    }

    return '';
}

function formatDateTime(value: string): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat(locale.value === 'zh' ? 'zh-CN' : 'en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

function formatSessionTitle(session: ReforgedChatSession): string {
    const title = session.title.trim();

    if (!title || title === 'New chat') {
        return session.character?.name ?? t.value.chat.untitled;
    }

    return title;
}

function formatSessionDescription(session: ReforgedChatSession): string {
    const character = session.character?.name ?? t.value.chat.noCharacterSession;
    return `${character} · ${formatDateTime(session.updatedAt)}`;
}

function formatSessionMessageCount(session: ReforgedChatSession): string {
    return t.value.chat.sessionMessageCount(session.messageIds.length);
}

function translateRuntimeIssue(issue: ReforgedConnectionRuntimeHandoffIssue): string {
    const issueMap: Record<ReforgedConnectionRuntimeHandoffIssueCode, string> = {
        'draft-empty': t.value.connection.issues.draftEmpty,
        'draft-incomplete': t.value.connection.messages.applyIncomplete,
        'draft-unapplied': t.value.connection.issues.draftUnapplied,
        'runtime-unwired': t.value.connection.issues.runtimeUnwired,
        'runtime-connection-unwired': issue.field === 'apiKey'
            ? t.value.connection.issues.apiKeyUnavailable
            : t.value.connection.issues.runtimeConnectionUnwired,
    };

    return issueMap[issue.code];
}

function translateRuntimeStatus(status: ReforgedConnectionRuntimeHandoffStatus): string {
    return t.value.connection.status[status].description;
}

function toChatCharacter(rosterItem: ReforgedCharacterRosterItem): ReforgedChatCharacterContext {
    return {
        id: rosterItem.id,
        name: rosterItem.card.name,
        description: rosterItem.card.description,
        personality: rosterItem.card.personality,
        scenario: rosterItem.card.scenario,
        firstMessage: rosterItem.card.firstMessage,
        exampleMessages: rosterItem.card.exampleMessages,
    };
}

function createDemoReply(request: HeadlessGenerationRequest, replyNumber: number): string {
    const prompt = Array.isArray(request.prompt) ? request.prompt : [];
    const lastUser = [...prompt].reverse().find((message) => message.role === 'user');
    const userText = typeof lastUser?.content === 'string' ? lastUser.content : t.value.chat.demoUserFallback;
    const systemMessage = prompt.find((message) => message.role === 'system');
    const systemText = typeof systemMessage?.content === 'string' ? systemMessage.content : '';
    const name = systemText.match(/roleplaying as ([^.]+)\./)?.[1]
        ?? characterName.value
        ?? t.value.chat.demoCharacterFallback;
    const hasLore = systemText.includes('World lore context:');

    return t.value.chat.demoReply(name, userText, replyNumber, hasLore);
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });
}

function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
</script>

<template>
    <section class="scene-console mx-auto flex h-full w-full max-w-6xl min-w-0 flex-col">
        <div class="mx-auto flex h-full min-h-0 min-w-0 w-full max-w-3xl flex-1 flex-col gap-3">
            <header class="console-surface flex min-w-0 items-center justify-between gap-3 rounded-lg px-3 py-3 sm:px-4">
                <div class="flex min-w-0 items-center gap-2">
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        :aria-label="t.chat.sessionsOpen"
                        @click="sessionDrawerOpen = true"
                    >
                        <svg
                            viewBox="0 0 20 20"
                            class="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.8"
                            aria-hidden="true"
                        >
                            <path
                                d="M4 6H16M4 10H16M4 14H16"
                                stroke-linecap="round"
                            />
                        </svg>
                    </Button>

                    <div class="min-w-0">
                        <h1 class="truncate font-display text-lg font-semibold text-neutral-50">
                            {{ headerTitle }}
                        </h1>
                        <p class="mt-0.5 truncate text-xs text-neutral-400">
                            {{ statusMessage }}
                        </p>
                    </div>
                </div>

                <div class="flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-neutral-950/60 p-1">
                    <button
                        type="button"
                        class="rounded-md px-3 py-1.5 text-xs font-medium transition"
                        :class="adapterMode === 'demo' ? 'bg-cyan-300 text-neutral-950' : 'text-neutral-300 hover:text-neutral-100'"
                        :disabled="chatStore.isGenerating"
                        @click="selectDemoAdapter()"
                    >
                        {{ t.chat.demo }}
                    </button>
                    <button
                        type="button"
                        class="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition"
                        :class="adapterMode === 'runtime' ? 'bg-cyan-300 text-neutral-950' : 'text-neutral-300 hover:text-neutral-100'"
                        :disabled="chatStore.isGenerating"
                        @click="() => activateRuntimeAdapter()"
                    >
                        <Spinner v-if="runtimeBusy" size="sm" tone="neutral" :label="t.chat.runtimeChecking" />
                        {{ t.chat.runtime }}
                    </button>
                </div>
            </header>

            <div
                v-if="runtimeFallbackNotice || (adapterMode === 'runtime' && !runtimeHandoff.canAttempt)"
                class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400/25 bg-amber-400/10 px-4 py-2.5 text-xs leading-5 text-amber-100"
            >
                <span class="min-w-0">{{ runtimeFallbackNotice ?? runtimeIssueLines[0] ?? statusMessage }}</span>
                <RouterLink
                    to="/connection"
                    class="inline-flex min-h-9 items-center rounded-md border border-cyan-300/30 bg-cyan-300/15 px-3 font-medium text-cyan-100 transition hover:bg-cyan-300/25"
                >
                    {{ t.chat.configureConnection }}
                </RouterLink>
            </div>

            <MultiplayerRoomPanel />

            <div
                ref="timeline"
                class="chat-stage console-surface scanline min-h-0 flex-1 space-y-4 overflow-y-auto rounded-lg px-3 py-5 sm:px-5"
            >
                <div
                    v-if="messages.length === 0"
                    class="flex min-h-72 flex-col items-center justify-center px-4 py-10 text-center"
                >
                    <div class="signal-glow flex h-14 w-14 items-center justify-center rounded-lg border border-cyan-300/25 bg-cyan-300/12 text-lg font-semibold text-cyan-100">
                        {{ characterName ? characterName.slice(0, 1) : t.chat.emptyAvatarFallback }}
                    </div>
                    <h3 class="mt-4 font-display text-lg font-semibold text-neutral-50">
                        {{ t.chat.emptyTitle }}
                    </h3>
                    <p class="mt-2 max-w-md text-sm leading-6 text-neutral-400">
                        {{ t.chat.emptyHint }}
                    </p>
                    <RouterLink
                        v-if="!selectedCharacter"
                        to="/characters"
                        class="mt-5 inline-flex min-h-11 items-center rounded-md border border-cyan-300/30 bg-cyan-300/15 px-4 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/25"
                    >
                        {{ t.chat.pickCharacter }}
                    </RouterLink>
                    <Button
                        v-else
                        type="button"
                        class="mt-5"
                        :disabled="chatStore.isGenerating"
                        @click="startCharacterSession"
                    >
                        {{ t.chat.openChat }}
                    </Button>
                </div>

                <article
                    v-for="message in messages"
                    :key="message.id"
                    class="flex"
                    :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
                >
                    <div :class="messageBubbleClass(message)">
                        <div class="mb-1.5 flex items-center justify-between gap-3 text-[0.7rem] font-semibold opacity-70">
                            <span class="font-display">{{ messageRoleLabel(message) }}</span>
                            <span v-if="formatMessageStatus(message)">{{ formatMessageStatus(message) }}</span>
                        </div>

                        <div
                            v-if="editingMessageId === message.id"
                            class="space-y-3"
                        >
                            <Textarea
                                v-model="editingContent"
                                :aria-label="t.chat.editMessage"
                                :rows="4"
                                :disabled="chatStore.isGenerating"
                            />
                            <div class="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    :disabled="editingContent.trim().length === 0 || chatStore.isGenerating"
                                    @click="saveEdit(message)"
                                >
                                    {{ t.common.save }}
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    :disabled="chatStore.isGenerating"
                                    @click="cancelEdit"
                                >
                                    {{ t.common.cancel }}
                                </Button>
                            </div>
                        </div>
                        <p
                            v-else
                            class="whitespace-pre-wrap"
                        >
                            {{ message.content || t.chat.generatingReply }}
                        </p>

                        <p
                            v-if="message.error"
                            class="mt-3 rounded-md border border-rose-400/20 bg-rose-400/12 px-3 py-2 text-xs leading-5 text-rose-100"
                        >
                            {{ message.error.message }}
                            <span
                                v-if="message.error.detail"
                                class="mt-1 block break-all text-rose-200/75"
                            >
                                {{ message.error.detail }}
                            </span>
                        </p>

                        <div
                            v-if="message.role === 'assistant' && message.alternatives.length > 1"
                            class="mt-3 flex flex-wrap items-center gap-1.5"
                        >
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                :aria-label="t.chat.prevSwipe"
                                :disabled="!canRunMessageAction(message) || message.activeAlternativeIndex <= 0"
                                @click="shiftSwipe(message, -1)"
                            >
                                ‹
                            </Button>
                            <span class="text-xs text-neutral-400">
                                {{ message.activeAlternativeIndex + 1 }} / {{ message.alternatives.length }}
                            </span>
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                :aria-label="t.chat.nextSwipe"
                                :disabled="!canRunMessageAction(message) || message.activeAlternativeIndex >= message.alternatives.length - 1"
                                @click="shiftSwipe(message, 1)"
                            >
                                ›
                            </Button>
                        </div>

                        <div class="mt-3 flex flex-wrap items-center gap-1.5">
                            <Button
                                v-if="message.role === 'assistant'"
                                type="button"
                                size="sm"
                                variant="ghost"
                                :loading="isMessageActionPending(message, 'regenerate')"
                                :disabled="!canRunMessageAction(message)"
                                @click="runAssistantAction(message, 'regenerate')"
                            >
                                {{ t.chat.regenerate }}
                            </Button>
                            <Button
                                v-if="message.role === 'assistant'"
                                type="button"
                                size="sm"
                                variant="ghost"
                                :loading="isMessageActionPending(message, 'continue')"
                                :disabled="!canRunMessageAction(message) || message.content.trim().length === 0"
                                @click="runAssistantAction(message, 'continue')"
                            >
                                {{ t.chat.continue }}
                            </Button>
                            <Button
                                v-if="message.role === 'assistant' && message.status === 'failed'"
                                type="button"
                                size="sm"
                                variant="outline"
                                :loading="isMessageActionPending(message, 'retry')"
                                :disabled="!canRunMessageAction(message)"
                                @click="runAssistantAction(message, 'retry')"
                            >
                                {{ t.chat.retry }}
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                :disabled="!canRunMessageAction(message)"
                                @click="beginEdit(message)"
                            >
                                {{ t.common.edit }}
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                :variant="confirmingDeleteMessageId === message.id ? 'danger' : 'ghost'"
                                :disabled="!canRunMessageAction(message)"
                                @click="deleteChatMessage(message)"
                            >
                                {{ confirmingDeleteMessageId === message.id ? t.common.confirm : t.common.delete }}
                            </Button>
                            <span class="ml-auto text-[0.7rem] opacity-60">{{ formatDateTime(message.createdAt) }}</span>
                        </div>
                    </div>
                </article>
            </div>

            <form
                class="safe-bottom console-surface rounded-lg p-2"
                @submit.prevent="sendMessage"
            >
                <div class="flex items-end gap-2">
                    <Textarea
                        v-model="composer"
                        data-testid="chat-composer"
                        :aria-label="t.chat.messageLabel"
                        :placeholder="t.chat.composerPlaceholder"
                        :rows="2"
                        :disabled="isGenerationBusy"
                        class="flex-1"
                    />
                    <Button
                        v-if="isGenerationBusy"
                        type="button"
                        variant="danger"
                        @click="stopGeneration"
                    >
                        {{ t.common.stop }}
                    </Button>
                    <Button
                        v-else
                        type="submit"
                        data-testid="send-message-button"
                        :disabled="!canSend"
                    >
                        {{ t.common.send }}
                    </Button>
                </div>
                <p class="px-2 pt-1.5 text-xs leading-5 text-neutral-500">
                    <template v-if="selectedCharacter">
                        {{ t.chat.speakingWith(selectedCharacter.card.name) }}
                        <span v-if="selectedWorldbook">{{ t.chat.worldbookSummary(selectedWorldbook.worldbook.name, lorebookEntryCount) }}</span>
                    </template>
                    <template v-else>
                        {{ t.chat.noCharacterHint }}
                    </template>
                </p>
            </form>
        </div>

        <Drawer
            v-model:open="sessionDrawerOpen"
            :title="t.chat.sessionsTitle"
            :description="t.chat.sessionCount(sortedSessions.length)"
            placement="left"
            size="md"
        >
            <div class="grid gap-3">
                <Button
                    type="button"
                    block
                    :disabled="chatStore.isGenerating"
                    @click="startFreshSession"
                >
                    {{ t.chat.newSession }}
                </Button>

                <Button
                    type="button"
                    block
                    variant="outline"
                    :disabled="chatStore.isGenerating"
                    @click="triggerLegacyChatImport"
                >
                    {{ t.chat.importLegacy.action }}
                </Button>
                <input
                    ref="legacyChatInput"
                    type="file"
                    accept=".jsonl,application/jsonl,application/x-ndjson"
                    class="hidden"
                    @change="handleLegacyChatFile"
                >

                <div
                    v-if="sortedSessions.length === 0"
                    class="rounded-lg border border-white/8 bg-neutral-950/54 px-3 py-4 text-sm leading-6 text-neutral-400"
                >
                    <p class="font-medium text-neutral-200">
                        {{ t.chat.noSessionsTitle }}
                    </p>
                    <p class="mt-1 text-xs leading-5">
                        {{ t.chat.noSessionsDescription }}
                    </p>
                </div>

                <div
                    v-for="session in sortedSessions"
                    :key="`drawer-${session.id}`"
                    class="flex items-stretch gap-2"
                >
                    <ListItem
                        class="min-w-0 flex-1"
                        :title="formatSessionTitle(session)"
                        :subtitle="formatSessionMessageCount(session)"
                        :description="formatSessionDescription(session)"
                        :selected="session.id === activeSession?.id"
                        :disabled="chatStore.isGenerating"
                        interactive
                        @press="selectChatSession(session.id)"
                    />
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        class="self-start"
                        :aria-label="t.chat.deleteSession(formatSessionTitle(session))"
                        :disabled="chatStore.isGenerating"
                        @click="removeChatSession(session)"
                    >
                        <svg
                            viewBox="0 0 20 20"
                            class="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.8"
                            aria-hidden="true"
                        >
                            <path
                                d="M6 6L14 14M14 6L6 14"
                                stroke-linecap="round"
                            />
                        </svg>
                    </Button>
                </div>
            </div>
        </Drawer>
    </section>
</template>

<style scoped>
.scene-console {
    position: relative;
}

.chat-stage article {
    animation: message-in 0.34s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes message-in {
    from {
        opacity: 0;
        transform: translateY(10px);
        filter: blur(4px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
        filter: blur(0);
    }
}

.chat-stage {
    background-image:
        linear-gradient(90deg, rgba(237, 247, 255, 0.035) 1px, transparent 1px),
        linear-gradient(180deg, rgba(237, 247, 255, 0.025) 1px, transparent 1px),
        linear-gradient(180deg, rgba(13, 21, 29, 0.88), rgba(7, 10, 13, 0.78));
    background-size: 48px 48px, 48px 48px, auto;
}

.message-bubble {
    position: relative;
}

.message-bubble::before {
    position: absolute;
    top: 0.75rem;
    left: -0.35rem;
    width: 0.7rem;
    height: 1px;
    content: '';
    background: rgba(237, 247, 255, 0.28);
}

.justify-end .message-bubble::before {
    right: -0.35rem;
    left: auto;
    background: rgba(143, 227, 208, 0.42);
}
</style>
