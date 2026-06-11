<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { createChatLorebookContext } from '@/services';
import { useCharacterStore, useChatStore, useConnectionStore, useWorldbookStore } from '@/stores';
import { Button, Spinner, Textarea } from '@/ui-kit';
import { useI18n } from '@/i18n';
import type { ReforgedCharacterRosterItem } from '@/contracts/character';
import type {
    ReforgedChatCharacterContext,
    ReforgedChatMessage,
    ReforgedChatRuntimeConnectionProvider,
    ReforgedChatSendInput,
} from '@/contracts/chat';
import type { EngineAdapterDiagnostics, HeadlessEngineAdapter, HeadlessGenerationRequest } from '@/contracts/engine';

type AdapterMode = 'demo' | 'runtime';
type ChatGenerationTrigger = 'normal' | 'continue';
type ChatActionKind = 'regenerate' | 'continue' | 'retry';
type RuntimeChatCompletionType = NonNullable<ReforgedChatSendInput['runtime']>['chatCompletionType'];
type ChatActionInput = Omit<ReforgedChatSendInput, 'content' | 'sessionId'>;

const characterStore = useCharacterStore();
const chatStore = useChatStore();
const connectionStore = useConnectionStore();
const worldbookStore = useWorldbookStore();
const { t, locale } = useI18n();

const adapterMode = ref<AdapterMode>('demo');
const composer = ref('');
const runtimeBusy = ref(false);
const runtimeNotice = ref<string | null>(null);
const runtimeDiagnostics = ref<EngineAdapterDiagnostics | null>(null);
const sendNotice = ref<string | null>(null);
const timeline = ref<HTMLElement | null>(null);
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
const messages = computed(() => chatStore.selectedMessages);
const readiness = computed(() => chatStore.readiness);
const runtimeAdapterReady = computed(() => (
    adapterMode.value === 'runtime' &&
    runtimeDiagnostics.value?.ok === true &&
    readiness.value.hasAdapter
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
const canSend = computed(() => (
    composer.value.trim().length > 0 &&
    readiness.value.canSend &&
    canAttemptRuntime.value &&
    !chatStore.isGenerating
));
const characterName = computed(() => selectedCharacter.value?.card.name ?? '');
const headerTitle = computed(() => (
    activeSession.value?.title ||
    selectedCharacter.value?.card.name ||
    t.value.chat.openChat
));
const statusMessage = computed(() => {
    if (chatStore.isGenerating) {
        return t.value.chat.generatingReply;
    }

    if (sendNotice.value) {
        return sendNotice.value;
    }

    if (adapterMode.value === 'runtime') {
        return runtimeNotice.value ?? runtimeHandoff.value.message;
    }

    return readiness.value.canSend ? t.value.chat.demoReady : readiness.value.reason?.message ?? t.value.chat.demoReady;
});
const runtimeIssueLines = computed(() => [
    ...runtimeHandoff.value.issues.map((issue) => issue.message),
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

onMounted(() => {
    selectDemoAdapter();
    autoStartSession();
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
            runtimeNotice.value = runtimeHandoff.value.message;
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

function selectDemoAdapter(): void {
    adapterMode.value = 'demo';
    runtimeBusy.value = false;
    runtimeNotice.value = null;
    runtimeDiagnostics.value = null;
    sendNotice.value = null;
    chatStore.setEngineAdapter(demoAdapter);
}

async function activateRuntimeAdapter(): Promise<void> {
    adapterMode.value = 'runtime';
    runtimeBusy.value = true;
    runtimeNotice.value = t.value.chat.runtimeChecking;
    runtimeDiagnostics.value = null;
    sendNotice.value = null;
    chatStore.setEngineAdapter(null);

    try {
        const { loadHeadlessEngineAdapter } = await import('@/engine-adapter/runtimeAdapterLoader');
        const runtimeAdapter = await loadHeadlessEngineAdapter();
        const diagnostics = await runtimeAdapter.inspect({ probeContext: true });
        runtimeDiagnostics.value = diagnostics;

        if (!diagnostics.ok) {
            runtimeNotice.value = diagnostics.blockers[0] ?? t.value.chat.runtimeDiagFailed;
            return;
        }

        chatStore.setEngineAdapter(runtimeAdapter);
        runtimeNotice.value = connectionStore.runtimeHandoff({
            runtimeAdapterReady: true,
            runtimeDirectRequestReady: runtimeAdapter.supportsDirectBackendChatCompletion === true && connectionStore.hasAppliedDraft,
        }).message;
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

async function sendMessage(): Promise<void> {
    const content = composer.value.trim();
    if (!content || chatStore.isGenerating) {
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
            responseLength: 220,
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
    if (message.role === 'user') {
        return t.value.chat.roleUser;
    }

    return characterName.value || t.value.chat.roleAssistant;
}

function messageBubbleClass(message: ReforgedChatMessage): string {
    const base = 'max-w-[min(40rem,90%)] rounded-[1.35rem] px-4 py-3 text-sm leading-7 shadow-[0_14px_40px_rgba(0,0,0,0.28)]';
    const role = message.role === 'user'
        ? 'ml-auto bg-cyan-300 text-neutral-950'
        : 'mr-auto border border-white/10 bg-white/8 text-neutral-100';
    const state = message.status === 'failed' ? 'ring-2 ring-rose-400/70' : '';
    const live = message.status === 'generating' ? 'lamp-glow' : '';

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

function toChatCharacter(rosterItem: ReforgedCharacterRosterItem): ReforgedChatCharacterContext {
    return {
        id: rosterItem.id,
        name: rosterItem.card.name,
        description: rosterItem.card.description,
        personality: rosterItem.card.personality,
        scenario: rosterItem.card.scenario,
        firstMessage: rosterItem.card.firstMessage,
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
</script>

<template>
    <section class="mx-auto flex h-[calc(100dvh-7.5rem)] w-full max-w-3xl flex-col gap-3 pb-2 lg:h-[calc(100dvh-3rem)]">
        <!-- 顶部条：角色名 + 极简模式切换 -->
        <header class="flex items-center justify-between gap-3 rounded-[1.5rem] border border-white/10 bg-neutral-900/80 px-4 py-3 backdrop-blur">
            <div class="min-w-0">
                <h1 class="truncate font-display text-lg font-semibold text-neutral-50">
                    {{ headerTitle }}
                </h1>
                <p class="mt-0.5 truncate text-xs text-neutral-400">
                    {{ statusMessage }}
                </p>
            </div>

            <div class="flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-neutral-950/60 p-1">
                <button
                    type="button"
                    class="rounded-full px-3 py-1.5 text-xs font-medium transition"
                    :class="adapterMode === 'demo' ? 'bg-cyan-300 text-neutral-950' : 'text-neutral-300 hover:text-neutral-100'"
                    :disabled="chatStore.isGenerating"
                    @click="selectDemoAdapter"
                >
                    {{ t.chat.demo }}
                </button>
                <button
                    type="button"
                    class="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition"
                    :class="adapterMode === 'runtime' ? 'bg-cyan-300 text-neutral-950' : 'text-neutral-300 hover:text-neutral-100'"
                    :disabled="chatStore.isGenerating"
                    @click="activateRuntimeAdapter"
                >
                    <Spinner v-if="runtimeBusy" size="sm" tone="neutral" :label="t.chat.runtimeChecking" />
                    {{ t.chat.runtime }}
                </button>
            </div>
        </header>

        <!-- 运行时未就绪的细提示 -->
        <div
            v-if="adapterMode === 'runtime' && !runtimeHandoff.canAttempt"
            class="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-2.5 text-xs leading-5 text-amber-100"
        >
            <span class="min-w-0">{{ runtimeIssueLines[0] ?? statusMessage }}</span>
            <RouterLink
                to="/connection"
                class="inline-flex min-h-9 items-center rounded-xl border border-cyan-300/30 bg-cyan-300/15 px-3 font-medium text-cyan-100 transition hover:bg-cyan-300/25"
            >
                {{ t.chat.configureConnection }}
            </RouterLink>
        </div>

        <!-- 时间线 -->
        <div
            ref="timeline"
            class="flex-1 space-y-4 overflow-y-auto rounded-[1.5rem] border border-white/10 bg-neutral-900/55 px-3 py-5 sm:px-5"
        >
            <!-- 空态 -->
            <div
                v-if="messages.length === 0"
                class="flex min-h-72 flex-col items-center justify-center px-4 py-10 text-center"
            >
                <div class="lamp-glow flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-300/12 text-lg font-semibold text-cyan-100">
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
                    class="mt-5 inline-flex min-h-11 items-center rounded-xl border border-cyan-300/30 bg-cyan-300/15 px-4 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/25"
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

            <!-- 消息 -->
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
                        class="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/12 px-3 py-2 text-xs leading-5 text-rose-100"
                    >
                        {{ message.error.message }}
                    </p>

                    <!-- swipe 切换 -->
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

                    <!-- 操作 -->
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

        <!-- 输入区 -->
        <form
            class="safe-bottom rounded-[1.6rem] border border-white/10 bg-neutral-900/85 p-2 backdrop-blur"
            @submit.prevent="sendMessage"
        >
            <div class="flex items-end gap-2">
                <Textarea
                    v-model="composer"
                    data-testid="chat-composer"
                    :aria-label="t.chat.messageLabel"
                    :placeholder="t.chat.composerPlaceholder"
                    :rows="2"
                    :disabled="chatStore.isGenerating"
                    class="flex-1"
                />
                <Button
                    v-if="chatStore.isGenerating"
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
    </section>
</template>
