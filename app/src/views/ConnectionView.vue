<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import type { ReforgedSelectOption, ReforgedUiTone } from '@/contracts/ui';
import type {
    ReforgedConnectionDraft,
    ReforgedConnectionDraftStatus,
    ReforgedConnectionRuntimeHandoffIssue,
    ReforgedConnectionRuntimeHandoffStatus,
    ReforgedConnectionValidationIssue,
} from '@/contracts/connection';
import { setConnectionDraftApiKeySecret, useConnectionStore } from '@/stores/connectionStore';
import { Button, Input, Select } from '@/ui-kit';

type ConnectionField = keyof ReforgedConnectionDraft;
type ConnectionStatus = ReforgedConnectionDraftStatus | ReforgedConnectionRuntimeHandoffStatus;

interface StatusCopy {
    label: string;
    title: string;
    description: string;
    tone: ReforgedUiTone;
}

interface DisplayIssue {
    id: string;
    message: string;
}

const providerOptions: ReforgedSelectOption[] = [
    {
        value: 'openai-compatible',
        label: 'OpenAI-compatible',
        description: 'Use the same-origin SillyTavern backend chat-completions seam.',
    },
];

const statusCopy: Record<ConnectionStatus, StatusCopy> = {
    empty: {
        label: 'Empty',
        title: 'No draft yet',
        description: 'Add a base URL, model, and memory-only API key before applying a Runtime configuration.',
        tone: 'neutral',
    },
    incomplete: {
        label: 'Incomplete',
        title: 'Draft needs attention',
        description: 'Fix the highlighted fields before this connection can be applied.',
        tone: 'danger',
    },
    complete: {
        label: 'Complete draft',
        title: 'Ready to apply',
        description: 'The draft validates locally. Apply it to make it available to Runtime mode.',
        tone: 'warning',
    },
    applied: {
        label: 'Applied',
        title: 'Configuration applied',
        description: 'This draft is in memory and matches the currently edited form.',
        tone: 'success',
    },
    'complete-unapplied': {
        label: 'Complete, unapplied',
        title: 'Apply the draft',
        description: 'The form is valid, but Runtime mode will not use it until you apply it.',
        tone: 'warning',
    },
    'applied-but-unwired': {
        label: 'Applied, waiting',
        title: 'Runtime path is not ready',
        description: 'The draft is applied, but the direct request path is not available from this page state.',
        tone: 'warning',
    },
    'ready-to-attempt': {
        label: 'Ready to attempt',
        title: 'Runtime handoff ready',
        description: 'The applied draft can be handed to Runtime mode for a same-origin request attempt.',
        tone: 'success',
    },
};

const connectionStore = useConnectionStore();

const applyMessage = ref<string | null>(null);
const applyIssues = ref<ReforgedConnectionValidationIssue[]>([]);
const apiKeyInput = ref('');

const runtimeHandoff = computed(() => connectionStore.runtimeHandoff({
    runtimeAdapterReady: connectionStore.hasAppliedDraft,
    runtimeDirectRequestReady: connectionStore.hasAppliedDraft,
}));

const runtimeStatus = computed(() => runtimeHandoff.value.status);
const draftStatus = computed(() => connectionStore.draftStatus);
const activeStatus = computed<ConnectionStatus>(() => {
    if (draftStatus.value === 'incomplete' || applyIssues.value.length > 0) {
        return 'incomplete';
    }

    return runtimeStatus.value;
});
const activeStatusCopy = computed(() => statusCopy[activeStatus.value]);
const draftStatusCopy = computed(() => statusCopy[draftStatus.value]);
const runtimeStatusCopy = computed(() => statusCopy[runtimeStatus.value]);
const activeIssues = computed<DisplayIssue[]>(() => [
    ...connectionStore.draftErrors.map((issue) => ({
        id: `draft-${issue.field}`,
        message: issue.message,
    })),
    ...runtimeHandoff.value.issues
        .filter((issue) => !hasDraftIssue(issue))
        .map((issue) => ({
            id: `runtime-${issue.code}-${issue.field ?? 'runtime'}`,
            message: issue.message,
        })),
]);
const appliedSummary = computed(() => {
    const applied = connectionStore.appliedDraft;
    if (!applied) {
        return [];
    }

    return [
        { label: 'Provider', value: providerLabel(applied.provider) },
        { label: 'Base URL', value: applied.baseUrl },
        { label: 'Model', value: applied.model },
        { label: 'Key', value: applied.apiKey.maskedValue || 'metadata unavailable' },
        { label: 'Applied', value: new Date(applied.appliedAt).toLocaleString() },
    ];
});

const fieldErrors = computed<Record<ConnectionField, string>>(() => {
    const errors = {
        provider: '',
        baseUrl: '',
        model: '',
        apiKey: '',
    };

    for (const issue of connectionStore.draftErrors) {
        errors[issue.field] = issue.message;
    }

    return errors;
});

watch(
    () => [
        connectionStore.draft.provider,
        connectionStore.draft.baseUrl,
        connectionStore.draft.model,
        connectionStore.draft.apiKey.hasValue,
        connectionStore.draft.apiKey.maskedValue,
    ],
    () => {
        applyMessage.value = null;
        applyIssues.value = [];
    },
    { flush: 'sync' },
);

function updateDraft(input: Partial<Pick<ReforgedConnectionDraft, 'baseUrl' | 'model'>>): void {
    connectionStore.patchDraft(input);
}

function updateProvider(value: string): void {
    if (value === 'openai-compatible') {
        connectionStore.patchDraft({ provider: value });
    }
}

function updateApiKey(value: string): void {
    apiKeyInput.value = value;
    setConnectionDraftApiKeySecret(connectionStore, value);
}

function applyConfiguration(): void {
    const result = connectionStore.applyDraft(new Date().toISOString());
    applyMessage.value = result.message;
    applyIssues.value = result.ok ? [] : result.issues;

    if (result.ok) {
        apiKeyInput.value = '';
    }
}

function resetDraft(): void {
    connectionStore.resetDraft();
    apiKeyInput.value = '';
    applyMessage.value = connectionStore.hasAppliedDraft
        ? 'Draft reset to the applied in-memory configuration.'
        : 'Draft reset. No connection configuration is applied.';
    applyIssues.value = [];
}

function clearKey(): void {
    connectionStore.clearApiKey();
    apiKeyInput.value = '';
    applyMessage.value = 'API key cleared from the transient vault. Re-enter a key before applying again.';
    applyIssues.value = [];
}

function clearAll(): void {
    connectionStore.clearAll();
    apiKeyInput.value = '';
    applyMessage.value = 'Connection draft and memory-only key metadata cleared.';
    applyIssues.value = [];
}

function providerLabel(value: ReforgedConnectionDraft['provider']): string {
    return providerOptions.find((option) => option.value === value)?.label ?? value;
}

function statusBadgeClass(tone: ReforgedUiTone): string {
    const toneClass: Record<ReforgedUiTone, string> = {
        neutral: 'border-white/10 bg-white/6 text-neutral-200',
        brand: 'border-cyan-400/20 bg-cyan-400/12 text-cyan-100',
        success: 'border-emerald-400/20 bg-emerald-400/12 text-emerald-100',
        warning: 'border-amber-400/20 bg-amber-400/12 text-amber-100',
        danger: 'border-rose-400/20 bg-rose-400/12 text-rose-100',
    };

    return toneClass[tone];
}

function statusSurfaceClass(tone: ReforgedUiTone): string {
    const toneClass: Record<ReforgedUiTone, string> = {
        neutral: 'border-white/10 bg-white/5 text-neutral-200',
        brand: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-100',
        success: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100',
        warning: 'border-amber-400/20 bg-amber-400/12 text-amber-100',
        danger: 'border-rose-400/20 bg-rose-400/12 text-rose-100',
    };

    return toneClass[tone];
}

function hasDraftIssue(issue: ReforgedConnectionRuntimeHandoffIssue): boolean {
    return issue.code === 'draft-empty' || issue.code === 'draft-incomplete' || issue.code === 'draft-unapplied';
}
</script>

<template>
    <section class="mx-auto grid w-full max-w-6xl gap-5 pb-6">
        <header class="grid gap-4 rounded-[1.75rem] border border-white/10 bg-neutral-900/92 p-5 shadow-[0_24px_120px_rgba(0,0,0,0.46)] backdrop-blur-xl sm:p-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
            <div>
                <p class="text-xs font-semibold uppercase text-cyan-200">
                    Connection
                </p>
                <h1 class="mt-3 text-3xl font-semibold text-white sm:text-4xl">
                    Configure Runtime access
                </h1>
                <p class="mt-3 max-w-3xl text-sm leading-6 text-neutral-300">
                    Set up one OpenAI-compatible endpoint, keep the key in the transient vault, and apply it to the
                    memory-only Runtime handoff.
                </p>
            </div>

            <div class="rounded-2xl border p-4" :class="statusSurfaceClass(activeStatusCopy.tone)">
                <p class="text-xs font-semibold uppercase">
                    Current status
                </p>
                <p class="mt-2 text-lg font-semibold">
                    {{ activeStatusCopy.label }}
                </p>
                <p class="mt-2 text-xs leading-5 opacity-85">
                    {{ runtimeHandoff.message }}
                </p>
            </div>
        </header>

        <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <form
                class="grid gap-5 rounded-[1.75rem] border border-white/10 bg-neutral-900/92 p-4 shadow-[0_24px_120px_rgba(0,0,0,0.42)] sm:p-5"
                @submit.prevent="applyConfiguration"
            >
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <p class="text-sm font-semibold text-white">
                            Provider draft
                        </p>
                        <p class="mt-1 text-sm leading-6 text-neutral-400">
                            First pass supports OpenAI-compatible backends through the direct backend seam.
                        </p>
                    </div>
                    <span
                        class="inline-flex w-fit rounded-full border px-3 py-1 text-xs font-medium"
                        :class="statusBadgeClass(draftStatusCopy.tone)"
                    >
                        {{ draftStatusCopy.label }}
                    </span>
                </div>

                <div class="grid gap-4">
                    <Select
                        :model-value="connectionStore.draft.provider"
                        :options="providerOptions"
                        label="Provider"
                        required
                        @update:model-value="updateProvider"
                    />

                    <Input
                        :model-value="connectionStore.draft.baseUrl"
                        :error="fieldErrors.baseUrl"
                        label="Base URL"
                        placeholder="https://api.example.com/v1"
                        inputmode="url"
                        autocomplete="off"
                        required
                        data-testid="connection-base-url-input"
                        @update:model-value="updateDraft({ baseUrl: $event })"
                    />

                    <Input
                        :model-value="connectionStore.draft.model"
                        :error="fieldErrors.model"
                        label="Model"
                        placeholder="gpt-4.1-compatible"
                        autocomplete="off"
                        required
                        data-testid="connection-model-input"
                        @update:model-value="updateDraft({ model: $event })"
                    />

                    <Input
                        :model-value="apiKeyInput"
                        :error="fieldErrors.apiKey"
                        :hint="connectionStore.maskedApiKey ? `Current key metadata: ${connectionStore.maskedApiKey}` : 'Stored only in memory; not persisted or placed in Pinia state.'"
                        label="API key"
                        placeholder="Paste API key"
                        type="password"
                        autocomplete="off"
                        required
                        data-testid="connection-api-key-input"
                        @update:model-value="updateApiKey"
                    />
                </div>

                <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Button
                        type="submit"
                        block
                        data-testid="connection-apply-button"
                    >
                        Apply configuration
                    </Button>
                    <Button
                        variant="secondary"
                        block
                        @click="resetDraft"
                    >
                        Reset draft
                    </Button>
                    <Button
                        variant="outline"
                        block
                        @click="clearKey"
                    >
                        Clear key
                    </Button>
                    <Button
                        variant="ghost"
                        block
                        @click="clearAll"
                    >
                        Clear all
                    </Button>
                </div>

                <div
                    v-if="applyMessage || applyIssues.length"
                    class="rounded-2xl border px-4 py-3 text-sm leading-6"
                    :class="statusSurfaceClass(applyIssues.length ? 'danger' : 'success')"
                    role="status"
                >
                    <p class="font-medium">
                        {{ applyMessage }}
                    </p>
                    <ul
                        v-if="applyIssues.length"
                        class="mt-2 space-y-1 text-xs"
                    >
                        <li
                            v-for="issue in applyIssues"
                            :key="`${issue.field}-${issue.message}`"
                        >
                            {{ issue.message }}
                        </li>
                    </ul>
                </div>
            </form>

            <aside class="grid gap-5">
                <section class="rounded-[1.75rem] border border-white/10 bg-neutral-900/92 p-4 shadow-[0_24px_120px_rgba(0,0,0,0.42)] sm:p-5">
                    <div class="flex items-start justify-between gap-3">
                        <div>
                            <p class="text-sm font-semibold text-white">
                                Runtime handoff
                            </p>
                            <p class="mt-1 text-sm leading-6 text-neutral-400">
                                {{ activeStatusCopy.title }}
                            </p>
                        </div>
                        <span
                            class="inline-flex rounded-full border px-3 py-1 text-xs font-medium"
                            :class="statusBadgeClass(runtimeStatusCopy.tone)"
                        >
                            {{ runtimeStatusCopy.label }}
                        </span>
                    </div>

                    <p class="mt-4 text-sm leading-6 text-neutral-300">
                        {{ activeStatusCopy.description }}
                    </p>

                    <ul
                        v-if="activeIssues.length"
                        class="mt-4 space-y-2"
                    >
                        <li
                            v-for="issue in activeIssues"
                            :key="issue.id"
                            class="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100"
                        >
                            {{ issue.message }}
                        </li>
                    </ul>

                    <div class="mt-4">
                        <Button
                            variant="outline"
                            block
                            disabled
                            aria-label="Test connection is not connected yet"
                        >
                            Test connection: not connected
                        </Button>
                    </div>
                </section>

                <section class="rounded-[1.75rem] border border-white/10 bg-neutral-900/92 p-4 shadow-[0_24px_120px_rgba(0,0,0,0.42)] sm:p-5">
                    <p class="text-sm font-semibold text-white">
                        Applied configuration
                    </p>

                    <dl
                        v-if="appliedSummary.length"
                        class="mt-4 grid gap-3"
                    >
                        <div
                            v-for="item in appliedSummary"
                            :key="item.label"
                            class="min-w-0 rounded-2xl border border-white/8 bg-neutral-950/70 px-3 py-2"
                        >
                            <dt class="text-xs font-medium text-neutral-500">
                                {{ item.label }}
                            </dt>
                            <dd class="mt-1 break-words text-sm text-neutral-100">
                                {{ item.value }}
                            </dd>
                        </div>
                    </dl>

                    <p
                        v-else
                        class="mt-4 rounded-2xl border border-white/8 bg-neutral-950/70 px-3 py-3 text-sm leading-6 text-neutral-400"
                    >
                        No applied draft yet. Complete the form and apply it before switching chat to Runtime mode.
                    </p>
                </section>

                <section class="rounded-[1.75rem] border border-white/10 bg-neutral-900/92 p-4 shadow-[0_24px_120px_rgba(0,0,0,0.42)] sm:p-5">
                    <p class="text-sm font-semibold text-white">
                        Next step
                    </p>
                    <p class="mt-2 text-sm leading-6 text-neutral-400">
                        Once the handoff is ready, move to chat and use Runtime mode for the actual request attempt.
                    </p>
                    <RouterLink
                        to="/chat"
                        class="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-white/12 bg-white/8 px-4 text-sm font-medium text-neutral-100 transition hover:bg-white/12"
                    >
                        Continue to chat
                    </RouterLink>
                </section>
            </aside>
        </div>
    </section>
</template>
