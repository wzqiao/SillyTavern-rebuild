<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { createChatLorebookContext } from '@/services';
import { useCharacterStore, useChatStore, useConnectionStore, useWorldbookStore } from '@/stores';
import { Button, Spinner, Textarea } from '@/ui-kit';
import type { ReforgedCharacterRosterItem } from '@/contracts/character';
import type {
    ReforgedChatCharacterContext,
    ReforgedChatMessage,
    ReforgedChatRuntimeConnectionProvider,
} from '@/contracts/chat';
import type { ReforgedUiTone } from '@/contracts/ui';
import type { EngineAdapterDiagnostics, HeadlessEngineAdapter, HeadlessGenerationRequest } from '@/contracts/engine';

type AdapterMode = 'demo' | 'runtime';

interface BadgeCopy {
    label: string;
    tone: ReforgedUiTone;
}

const characterStore = useCharacterStore();
const chatStore = useChatStore();
const connectionStore = useConnectionStore();
const worldbookStore = useWorldbookStore();

const adapterMode = ref<AdapterMode>('demo');
const composer = ref('');
const runtimeBusy = ref(false);
const runtimeNotice = ref<string | null>(null);
const runtimeDiagnostics = ref<EngineAdapterDiagnostics | null>(null);
const sendNotice = ref<string | null>(null);
const timeline = ref<HTMLElement | null>(null);

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
        await delay(260);
        return createDemoReply(request);
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
const chatTargetTitle = computed(() => (
    activeSession.value?.title ||
    selectedCharacter.value?.card.name ||
    'Open character chat'
));
const statusMessage = computed(() => {
    if (chatStore.isGenerating) {
        return 'Generating a reply...';
    }

    if (sendNotice.value) {
        return sendNotice.value;
    }

    if (adapterMode.value === 'runtime') {
        return runtimeNotice.value ?? runtimeHandoff.value.message;
    }

    return readiness.value.canSend ? 'Demo mode is ready.' : readiness.value.reason?.message ?? 'Chat is waiting for an adapter.';
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
const lorebookPreviewEntries = computed(() => lorebookContext.value?.entries.slice(0, 3) ?? []);
const sessionOptions = computed(() => chatStore.sessions);
const modeBadge = computed<BadgeCopy>(() => {
    if (adapterMode.value === 'runtime' && runtimeHandoff.value.canAttempt) {
        return { label: 'Runtime ready', tone: 'success' };
    }

    if (adapterMode.value === 'runtime') {
        return { label: runtimeHandoff.value.status, tone: 'warning' };
    }

    return { label: 'Demo ready', tone: 'brand' };
});
const generationBadge = computed<BadgeCopy>(() => {
    if (chatStore.generation.status === 'failed' || chatStore.generation.status === 'cancelled') {
        return { label: chatStore.generation.status, tone: 'danger' };
    }

    if (chatStore.isGenerating) {
        return { label: 'generating', tone: 'warning' };
    }

    return { label: 'idle', tone: 'neutral' };
});

onMounted(() => {
    selectDemoAdapter();
});

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
    runtimeNotice.value = 'Checking the same-origin SillyTavern runtime...';
    runtimeDiagnostics.value = null;
    sendNotice.value = null;
    chatStore.setEngineAdapter(null);

    try {
        const { loadHeadlessEngineAdapter } = await import('@/engine-adapter/runtimeAdapterLoader');
        const runtimeAdapter = await loadHeadlessEngineAdapter();
        const diagnostics = await runtimeAdapter.inspect({ probeContext: true });
        runtimeDiagnostics.value = diagnostics;

        if (!diagnostics.ok) {
            runtimeNotice.value = diagnostics.blockers[0] ?? 'Runtime diagnostics did not pass.';
            return;
        }

        chatStore.setEngineAdapter(runtimeAdapter);
        runtimeNotice.value = connectionStore.runtimeHandoff({
            runtimeAdapterReady: true,
            runtimeDirectRequestReady: runtimeAdapter.supportsDirectBackendChatCompletion === true && connectionStore.hasAppliedDraft,
        }).message;
    } catch (error) {
        runtimeNotice.value = `Runtime adapter failed to load: ${describeError(error)}`;
        chatStore.setEngineAdapter(null);
    } finally {
        runtimeBusy.value = false;
    }
}

function selectSession(sessionId: string): void {
    chatStore.selectSession(sessionId);
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
            return;
        }

        runtimeConnectionProvider = handoff.takeRuntimeConnection;
        if (!runtimeConnectionProvider) {
            runtimeNotice.value = 'Runtime API key is no longer available in memory. Re-enter it on the connection page.';
            return;
        }
    }

    const lorebooks = selectedWorldbook.value
        ? [createChatLorebookContext(selectedWorldbook.value, {
            generationTrigger: 'normal',
            messages: messages.value,
            nextMessage: content,
        })]
        : [];
    const character = selectedCharacter.value
        ? toChatCharacter(selectedCharacter.value)
        : activeSession.value?.character ?? null;

    composer.value = '';
    const result = await chatStore.sendUserMessage({
        content,
        character,
        lorebooks,
        runtime: {
            mode: adapterMode.value === 'runtime' ? 'chat-completion' : 'generate-text',
            chatCompletionType: adapterMode.value === 'runtime' ? 'quiet' : undefined,
        },
        runtimeConnectionProvider,
        generation: {
            api: handoff.generation.api,
            responseLength: 220,
        },
    });

    if (!result.ok) {
        composer.value = content;
        sendNotice.value = result.error.message;
    }
}

function stopGeneration(): void {
    chatStore.cancelGeneration();
}

function messageBubbleClass(message: ReforgedChatMessage): string {
    const base = 'max-w-[min(40rem,88%)] rounded-[1.35rem] px-4 py-3 text-sm leading-6 shadow-[0_18px_50px_rgba(0,0,0,0.24)]';
    const role = message.role === 'user'
        ? 'ml-auto bg-cyan-300 text-neutral-950'
        : 'mr-auto border border-white/10 bg-white/8 text-neutral-100';
    const state = message.status === 'failed' ? 'ring-2 ring-rose-400/70' : '';

    return [base, role, state].filter(Boolean).join(' ');
}

function badgeClass(tone: ReforgedUiTone): string {
    const toneClass: Record<ReforgedUiTone, string> = {
        neutral: 'border-white/10 bg-white/6 text-neutral-200',
        brand: 'border-cyan-400/20 bg-cyan-400/12 text-cyan-100',
        success: 'border-emerald-400/20 bg-emerald-400/12 text-emerald-100',
        warning: 'border-amber-400/20 bg-amber-400/12 text-amber-100',
        danger: 'border-rose-400/20 bg-rose-400/12 text-rose-100',
    };

    return `inline-flex items-center rounded-full border px-2.5 py-1 text-[0.6875rem] font-medium ${toneClass[tone]}`;
}

function formatMessageStatus(message: ReforgedChatMessage): string {
    if (message.status === 'generating' && !message.content) {
        return 'streaming';
    }

    return message.status;
}

function formatDateTime(value: string): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat(undefined, {
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

function createDemoReply(request: HeadlessGenerationRequest): string {
    const prompt = Array.isArray(request.prompt) ? request.prompt : [];
    const lastUser = [...prompt].reverse().find((message) => message.role === 'user');
    const userText = typeof lastUser?.content === 'string' ? lastUser.content : 'that';
    const systemMessage = prompt.find((message) => message.role === 'system');
    const systemText = typeof systemMessage?.content === 'string' ? systemMessage.content : '';
    const characterName = systemText.match(/roleplaying as ([^.]+)\./)?.[1] ?? 'The assistant';
    const hasLore = systemText.includes('World lore context:');

    return `${characterName} pauses, takes in "${userText}", and answers in a steady voice: we can build from here.${hasLore ? ' The selected worldbook notes are folded into the scene.' : ''}`;
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
    <section class="mx-auto grid min-h-[calc(100dvh-7rem)] w-full max-w-7xl gap-4 pb-28 sm:gap-5 lg:grid-cols-[minmax(17rem,0.34fr)_minmax(0,1fr)] lg:pb-6">
        <aside class="grid min-w-0 gap-4 self-start lg:sticky lg:top-5">
            <section class="rounded-[1.5rem] border border-white/10 bg-neutral-900/92 p-4 shadow-[0_20px_90px_rgba(0,0,0,0.38)] sm:p-5">
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <p class="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-cyan-200/75">
                            Chat
                        </p>
                        <h1 class="mt-2 text-2xl font-semibold tracking-normal text-neutral-50">
                            {{ chatTargetTitle }}
                        </h1>
                    </div>
                    <span :class="badgeClass(modeBadge.tone)">
                        {{ modeBadge.label }}
                    </span>
                </div>

                <div class="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-white/8 bg-neutral-950/70 p-1.5">
                    <Button
                        type="button"
                        size="sm"
                        :variant="adapterMode === 'demo' ? 'primary' : 'ghost'"
                        :disabled="chatStore.isGenerating"
                        @click="selectDemoAdapter"
                    >
                        Demo
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        :variant="adapterMode === 'runtime' ? 'primary' : 'ghost'"
                        :loading="runtimeBusy"
                        :disabled="chatStore.isGenerating"
                        @click="activateRuntimeAdapter"
                    >
                        Runtime
                    </Button>
                </div>

                <p class="mt-4 text-sm leading-6 text-neutral-300">
                    {{ statusMessage }}
                </p>

                <ul
                    v-if="adapterMode === 'runtime' && runtimeIssueLines.length"
                    class="mt-3 grid gap-2 text-xs leading-5 text-amber-100"
                >
                    <li
                        v-for="line in runtimeIssueLines"
                        :key="line"
                        class="rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2"
                    >
                        {{ line }}
                    </li>
                </ul>

                <div
                    v-if="adapterMode === 'runtime' && !runtimeHandoff.canAttempt"
                    class="mt-4 flex flex-wrap gap-2"
                >
                    <RouterLink
                        to="/connection"
                        class="inline-flex min-h-10 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-300/12 px-3.5 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/18"
                    >
                        Configure connection
                    </RouterLink>
                </div>
            </section>

            <section class="rounded-[1.5rem] border border-white/10 bg-neutral-900/88 p-4 shadow-[0_18px_70px_rgba(0,0,0,0.28)] sm:p-5">
                <div class="flex items-center justify-between gap-3">
                    <h2 class="text-sm font-semibold text-neutral-50">
                        Context
                    </h2>
                    <span :class="badgeClass(generationBadge.tone)">
                        {{ generationBadge.label }}
                    </span>
                </div>

                <dl class="mt-4 grid gap-3 text-sm">
                    <div class="rounded-2xl border border-white/8 bg-white/[0.04] p-3">
                        <dt class="text-xs font-medium text-neutral-500">Character</dt>
                        <dd class="mt-1 text-neutral-100">
                            {{ selectedCharacter?.card.name ?? 'No character selected' }}
                        </dd>
                        <RouterLink
                            v-if="!selectedCharacter"
                            to="/characters"
                            class="mt-2 inline-flex text-xs font-medium text-cyan-200 hover:text-cyan-100"
                        >
                            Pick a character
                        </RouterLink>
                        <Button
                            v-else
                            type="button"
                            size="sm"
                            variant="outline"
                            class="mt-3"
                            :disabled="chatStore.isGenerating"
                            @click="startCharacterSession"
                        >
                            Open session
                        </Button>
                    </div>

                    <div class="rounded-2xl border border-white/8 bg-white/[0.04] p-3">
                        <dt class="text-xs font-medium text-neutral-500">Worldbook</dt>
                        <dd class="mt-1 text-neutral-100">
                            {{ selectedWorldbook?.worldbook.name ?? 'No worldbook selected' }}
                        </dd>
                        <RouterLink
                            v-if="!selectedWorldbook"
                            to="/worldbooks"
                            class="mt-2 inline-flex text-xs font-medium text-cyan-200 hover:text-cyan-100"
                        >
                            Add lore context
                        </RouterLink>
                        <ul
                            v-else-if="lorebookPreviewEntries.length"
                            class="mt-2 grid gap-1 text-xs leading-5 text-neutral-400"
                        >
                            <li
                                v-for="entry in lorebookPreviewEntries"
                                :key="entry.id"
                                class="truncate"
                            >
                                {{ entry.title || entry.content }}
                            </li>
                        </ul>
                    </div>

                    <div class="rounded-2xl border border-white/8 bg-white/[0.04] p-3">
                        <dt class="text-xs font-medium text-neutral-500">Connection</dt>
                        <dd class="mt-1 text-neutral-100">
                            {{ connectionStore.appliedDraft?.model ?? 'Demo local replies' }}
                        </dd>
                        <p class="mt-1 text-xs leading-5 text-neutral-500">
                            {{ adapterMode === 'runtime' ? runtimeHandoff.status : 'Runtime disabled' }}
                        </p>
                    </div>
                </dl>
            </section>

            <section
                v-if="sessionOptions.length"
                class="rounded-[1.5rem] border border-white/10 bg-neutral-900/88 p-4 shadow-[0_18px_70px_rgba(0,0,0,0.24)] sm:p-5"
            >
                <h2 class="text-sm font-semibold text-neutral-50">
                    Sessions
                </h2>
                <div class="mt-3 grid gap-2">
                    <button
                        v-for="session in sessionOptions"
                        :key="session.id"
                        type="button"
                        class="rounded-2xl border px-3 py-2 text-left transition"
                        :class="session.id === activeSession?.id ? 'border-cyan-300/35 bg-cyan-300/10 text-cyan-50' : 'border-white/8 bg-white/[0.03] text-neutral-300 hover:bg-white/[0.06]'"
                        @click="selectSession(session.id)"
                    >
                        <span class="block truncate text-sm font-medium">{{ session.title }}</span>
                        <span class="mt-1 block text-xs text-neutral-500">{{ session.messageIds.length }} messages</span>
                    </button>
                </div>
            </section>
        </aside>

        <section class="flex min-h-[38rem] min-w-0 flex-col overflow-hidden rounded-[1.5rem] border border-white/10 bg-neutral-900/92 shadow-[0_24px_120px_rgba(0,0,0,0.44)]">
            <header class="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-5">
                <div class="min-w-0">
                    <p class="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
                        Conversation
                    </p>
                    <h2 class="mt-1 truncate text-lg font-semibold text-neutral-50">
                        {{ activeSession?.title ?? selectedCharacter?.card.name ?? 'Untitled demo chat' }}
                    </h2>
                </div>

                <Button
                    v-if="chatStore.isGenerating"
                    type="button"
                    variant="danger"
                    size="sm"
                    @click="stopGeneration"
                >
                    Stop
                </Button>
            </header>

            <div
                ref="timeline"
                class="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-5"
            >
                <div
                    v-if="messages.length === 0"
                    class="flex min-h-80 flex-col items-center justify-center rounded-[1.35rem] border border-dashed border-white/12 bg-neutral-950/42 px-4 py-10 text-center"
                >
                    <div class="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/12 text-sm font-semibold text-cyan-100">
                        ST
                    </div>
                    <h3 class="mt-4 text-lg font-semibold text-neutral-50">
                        Start the chat loop
                    </h3>
                    <p class="mt-2 max-w-md text-sm leading-6 text-neutral-400">
                        Send a message in demo mode, or activate Runtime after applying an OpenAI-compatible connection.
                    </p>
                </div>

                <article
                    v-for="message in messages"
                    :key="message.id"
                    class="flex"
                    :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
                >
                    <div :class="messageBubbleClass(message)">
                        <div class="mb-2 flex items-center justify-between gap-3 text-[0.68rem] font-semibold uppercase tracking-[0.14em] opacity-70">
                            <span>{{ message.role }}</span>
                            <span>{{ formatMessageStatus(message) }}</span>
                        </div>

                        <p class="whitespace-pre-wrap">
                            {{ message.content || 'Generating...' }}
                        </p>

                        <p
                            v-if="message.error"
                            class="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/12 px-3 py-2 text-xs leading-5 text-rose-100"
                        >
                            {{ message.error.message }}
                        </p>

                        <div class="mt-3 flex flex-wrap items-center gap-2 text-xs opacity-70">
                            <span>{{ formatDateTime(message.createdAt) }}</span>
                            <span v-if="message.role === 'assistant' && message.alternatives.length > 1">
                                {{ message.activeAlternativeIndex + 1 }} / {{ message.alternatives.length }}
                            </span>
                        </div>
                    </div>
                </article>
            </div>

            <form class="border-t border-white/10 bg-neutral-950/60 p-3 sm:p-4" @submit.prevent="sendMessage">
                <div class="rounded-[1.25rem] border border-white/10 bg-neutral-950/78 p-2">
                    <Textarea
                        v-model="composer"
                        data-testid="chat-composer"
                        label="Message"
                        placeholder="Send a message..."
                        :rows="3"
                        :disabled="chatStore.isGenerating"
                    />

                    <div class="mt-3 flex flex-col gap-3 px-1 pb-1 sm:flex-row sm:items-center sm:justify-between">
                        <p class="text-xs leading-5 text-neutral-500">
                            {{ selectedCharacter ? `Speaking with ${selectedCharacter.card.name}` : 'No character selected; demo chat can still start.' }}
                        </p>
                        <div class="flex gap-2">
                            <Button
                                v-if="chatStore.isGenerating"
                                type="button"
                                variant="danger"
                                @click="stopGeneration"
                            >
                                Stop
                            </Button>
                            <Button
                                type="submit"
                                data-testid="send-message-button"
                                :disabled="!canSend"
                            >
                                <template v-if="chatStore.isGenerating">
                                    <Spinner size="sm" tone="neutral" label="Generating" />
                                    Generating
                                </template>
                                <template v-else>
                                    Send
                                </template>
                            </Button>
                        </div>
                    </div>
                </div>
            </form>
        </section>
    </section>
</template>
