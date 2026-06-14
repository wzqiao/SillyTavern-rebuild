<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import type { ReforgedSelectOption, ReforgedUiTone } from '@/contracts/ui';
import type {
    ReforgedConnectionDraft,
    ReforgedConnectionDraftStatus,
    ReforgedConnectionRuntimeHandoffIssue,
    ReforgedConnectionRuntimeHandoffIssueCode,
    ReforgedConnectionRuntimeHandoffStatus,
    ReforgedConnectionValidationIssue,
} from '@/contracts/connection';
import { useI18n } from '@/i18n';
import { MANAGED_PROVIDER_DISPLAY_URL, setConnectionDraftApiKeySecret, useConnectionStore } from '@/stores/connectionStore';
import { usePresetStore } from '@/stores/presetStore';
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

const { t, locale } = useI18n();
const connectionStore = useConnectionStore();
const presetStore = usePresetStore();

const presetFileInput = ref<HTMLInputElement | null>(null);
const presetNotice = ref<string | null>(null);

const modelOptions = computed<ReforgedSelectOption[]>(() => connectionStore.availableModels.map((model) => ({
    value: model,
    label: model,
})));

const probeStatus = computed(() => {
    const probe = connectionStore.lastProbe;

    if (!probe) {
        return null;
    }

    if (probe.ok) {
        return {
            tone: 'success' as const,
            text: probe.models && probe.models.length > 0
                ? t.value.connection.probe.success(probe.models.length, probe.latencyMs ?? 0)
                : t.value.connection.probe.successNoList(probe.latencyMs ?? 0),
        };
    }

    const text = probe.code === 'config'
        ? t.value.connection.probe.failConfig
        : probe.code === 'cors-or-network'
            ? t.value.connection.probe.failCors
            : t.value.connection.probe.failHttp(probe.detail ?? '');

    return { tone: 'danger' as const, text };
});

async function runProbe(): Promise<void> {
    connectionStore.normalizeDraftFields();
    await connectionStore.probeConnection();
}

const presetOptions = computed<ReforgedSelectOption[]>(() => [
    { value: '', label: t.value.connection.preset.none },
    ...presetStore.presets.map((item) => ({
        value: item.id,
        label: item.preset.name,
        description: item.source.fileName,
    })),
]);

const selectedPresetSummary = computed(() => {
    const item = presetStore.selectedPreset;
    if (!item) {
        return null;
    }

    const sampling = item.preset.sampling;
    const samplingParts = [
        sampling.temperature != null ? `temp ${sampling.temperature}` : null,
        sampling.topP != null ? `top_p ${sampling.topP}` : null,
        sampling.maxTokens != null ? `max ${sampling.maxTokens}` : null,
    ].filter(Boolean);

    return {
        prompts: t.value.connection.preset.summary(
            item.preset.prompts.filter((prompt) => prompt.enabled).length,
            item.preset.prompts.length,
        ),
        sampling: samplingParts.join(' · '),
        warnings: item.warnings,
    };
});

function triggerPresetImport(): void {
    presetFileInput.value?.click();
}

async function handlePresetFileChange(event: Event): Promise<void> {
    const inputElement = event.target as HTMLInputElement;
    const file = inputElement.files?.[0];
    inputElement.value = '';

    if (!file) {
        return;
    }

    const text = await file.text();
    const result = presetStore.importPreset({ fileName: file.name, mimeType: file.type, text });
    presetNotice.value = result.ok
        ? (result.warnings.length > 0
            ? t.value.connection.preset.importedWithWarnings(result.preset.name, result.warnings.length)
            : t.value.connection.preset.imported(result.preset.name))
        : result.message;
}

function updateSelectedPreset(value: string): void {
    presetStore.selectPreset(value || null);
    presetNotice.value = null;
}

function removeSelectedPreset(): void {
    if (presetStore.selectedPresetId) {
        presetStore.removePreset(presetStore.selectedPresetId);
        presetNotice.value = null;
    }
}

const providerOptions = computed<ReforgedSelectOption[]>(() => [
    {
        value: 'openai-compatible',
        label: t.value.connection.providerOpenAI,
        description: t.value.connection.providerOpenAIDescription,
    },
]);

const statusTone: Record<ConnectionStatus, ReforgedUiTone> = {
    empty: 'neutral',
    incomplete: 'danger',
    complete: 'warning',
    applied: 'success',
    'complete-unapplied': 'warning',
    'applied-but-unwired': 'warning',
    'ready-to-attempt': 'success',
};

const statusCopy = computed<Record<ConnectionStatus, StatusCopy>>(() => {
    const source = t.value.connection.status;

    return {
        empty: { ...source.empty, tone: statusTone.empty },
        incomplete: { ...source.incomplete, tone: statusTone.incomplete },
        complete: { ...source.complete, tone: statusTone.complete },
        applied: { ...source.applied, tone: statusTone.applied },
        'complete-unapplied': { ...source['complete-unapplied'], tone: statusTone['complete-unapplied'] },
        'applied-but-unwired': { ...source['applied-but-unwired'], tone: statusTone['applied-but-unwired'] },
        'ready-to-attempt': { ...source['ready-to-attempt'], tone: statusTone['ready-to-attempt'] },
    };
});

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
const activeStatusCopy = computed(() => statusCopy.value[activeStatus.value]);
const draftStatusCopy = computed(() => statusCopy.value[draftStatus.value]);
const runtimeStatusCopy = computed(() => statusCopy.value[runtimeStatus.value]);
const activeIssues = computed<DisplayIssue[]>(() => [
    ...connectionStore.draftErrors.map((issue) => ({
        id: `draft-${issue.field}`,
        message: translateDraftIssue(issue),
    })),
    ...runtimeHandoff.value.issues
        .filter((issue) => !hasDraftIssue(issue))
        .map((issue) => ({
            id: `runtime-${issue.code}-${issue.field ?? 'runtime'}`,
            message: translateRuntimeIssue(issue),
        })),
]);
const appliedSummary = computed(() => {
    const applied = connectionStore.appliedDraft;
    if (!applied) {
        return [];
    }

    return [
        { label: t.value.connection.summaryLabels.provider, value: providerLabel(applied.provider) },
        { label: t.value.connection.summaryLabels.baseUrl, value: applied.baseUrl },
        { label: t.value.connection.summaryLabels.model, value: applied.model },
        { label: t.value.connection.summaryLabels.key, value: applied.apiKey.maskedValue || t.value.connection.messages.metadataUnavailable },
        { label: t.value.connection.summaryLabels.applied, value: new Date(applied.appliedAt).toLocaleString(locale.value === 'zh' ? 'zh-CN' : 'en-US') },
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
        errors[issue.field] = translateDraftIssue(issue);
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

function updateApiKey(value: string): void {
    apiKeyInput.value = value;
    setConnectionDraftApiKeySecret(connectionStore, value);
}

function applyConfiguration(): void {
    const result = connectionStore.applyDraft(new Date().toISOString());
    applyMessage.value = result.ok
        ? t.value.connection.messages.applySuccess
        : result.issues[0]
            ? translateDraftIssue(result.issues[0])
            : t.value.connection.messages.applyIncomplete;
    applyIssues.value = result.ok ? [] : result.issues;

    if (result.ok) {
        apiKeyInput.value = '';
    }
}

function resetDraft(): void {
    connectionStore.resetDraft();
    apiKeyInput.value = '';
    applyMessage.value = connectionStore.hasAppliedDraft
        ? t.value.connection.messages.resetToApplied
        : t.value.connection.messages.resetEmpty;
    applyIssues.value = [];
}

function clearKey(): void {
    connectionStore.clearApiKey();
    apiKeyInput.value = '';
    applyMessage.value = t.value.connection.messages.keyCleared;
    applyIssues.value = [];
}

function clearAll(): void {
    connectionStore.clearAll();
    apiKeyInput.value = '';
    applyMessage.value = t.value.connection.messages.allCleared;
    applyIssues.value = [];
}

function providerLabel(value: ReforgedConnectionDraft['provider']): string {
    return providerOptions.value.find((option) => option.value === value)?.label ?? value;
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

function translateDraftIssue(issue: ReforgedConnectionValidationIssue): string {
    if (issue.field === 'baseUrl') {
        return connectionStore.draft.baseUrl.trim()
            ? t.value.connection.issues.baseUrlProtocol
            : t.value.connection.issues.baseUrlRequired;
    }

    if (issue.field === 'model') {
        return t.value.connection.issues.modelRequired;
    }

    if (issue.field === 'apiKey') {
        return issue.message.includes('metadata')
            ? t.value.connection.issues.secretUnavailable
            : t.value.connection.issues.apiKeyRequired;
    }

    return t.value.connection.issues.provider;
}

function translateRuntimeIssue(issue: ReforgedConnectionRuntimeHandoffIssue): string {
    if (issue.code === 'draft-incomplete' && issue.field) {
        return translateDraftIssue({ field: issue.field, message: issue.message });
    }

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
</script>

<template>
    <section class="mx-auto grid w-full max-w-3xl gap-4 pb-6">
        <header class="rounded-[1.75rem] border border-white/10 bg-neutral-900/92 p-5 shadow-[0_24px_120px_rgba(0,0,0,0.46)] backdrop-blur-xl sm:p-6">
            <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div class="min-w-0">
                    <p class="text-xs font-semibold uppercase text-cyan-200">
                        {{ t.connection.headerEyebrow }}
                    </p>
                    <h1 class="mt-3 font-display text-3xl font-semibold text-white sm:text-4xl">
                        {{ t.connection.headerTitle }}
                    </h1>
                    <p class="mt-3 max-w-2xl text-sm leading-6 text-neutral-300">
                        {{ t.connection.headerDescription }}
                    </p>
                </div>

                <span
                    class="inline-flex w-fit rounded-full border px-3 py-1 text-xs font-medium"
                    :class="statusBadgeClass(draftStatusCopy.tone)"
                >
                    {{ draftStatusCopy.label }}
                </span>
            </div>

            <div class="mt-5 rounded-2xl border p-4" :class="statusSurfaceClass(activeStatusCopy.tone)">
                <p class="text-xs font-semibold uppercase">
                    {{ t.connection.currentStatus }}
                </p>
                <p class="mt-2 text-lg font-semibold">
                    {{ activeStatusCopy.title }}
                </p>
                <p class="mt-2 text-sm leading-6 opacity-85">
                    {{ activeStatusCopy.description }}
                </p>
            </div>
        </header>

        <form
            class="grid gap-5 rounded-[1.75rem] border border-white/10 bg-neutral-900/92 p-4 shadow-[0_24px_120px_rgba(0,0,0,0.42)] sm:p-5"
            @submit.prevent="applyConfiguration"
        >
            <div>
                <p class="text-sm font-semibold text-white">
                    {{ t.connection.draftTitle }}
                </p>
                <p class="mt-1 text-sm leading-6 text-neutral-400">
                    {{ t.connection.draftDescription }}
                </p>
            </div>

            <div class="grid gap-4">
                <div class="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm leading-6 text-cyan-50">
                    <p class="text-xs font-semibold uppercase text-cyan-200">
                        {{ t.connection.managedEndpoint.label }}
                    </p>
                    <p class="mt-1 font-mono text-sm text-white">
                        {{ MANAGED_PROVIDER_DISPLAY_URL }}
                    </p>
                    <p class="mt-1 text-xs leading-5 text-cyan-100/80">
                        {{ t.connection.managedEndpoint.description }}
                    </p>
                </div>

                <Input
                    :model-value="apiKeyInput"
                    :error="fieldErrors.apiKey"
                    :hint="connectionStore.maskedApiKey ? t.connection.fields.apiKeyStoredHint.replace('{key}', connectionStore.maskedApiKey) : t.connection.fields.apiKeyEmptyHint"
                    :label="t.connection.fields.apiKey"
                    :placeholder="t.connection.fields.apiKeyPlaceholder"
                    type="password"
                    autocomplete="off"
                    required
                    data-testid="connection-api-key-input"
                    @update:model-value="updateApiKey"
                />

                <Input
                    :model-value="connectionStore.draft.model"
                    :error="fieldErrors.model"
                    :hint="t.connection.fields.modelHint"
                    :label="t.connection.fields.model"
                    :placeholder="t.connection.fields.modelPlaceholder"
                    autocomplete="off"
                    required
                    data-testid="connection-model-input"
                    @update:model-value="updateDraft({ model: $event })"
                />

                <Select
                    v-if="modelOptions.length > 0"
                    :model-value="connectionStore.availableModels.includes(connectionStore.draft.model) ? connectionStore.draft.model : ''"
                    :options="modelOptions"
                    :label="t.connection.probe.pickModel"
                    :placeholder="t.connection.fields.modelPlaceholder"
                    @update:model-value="updateDraft({ model: $event })"
                />

                <div class="grid gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        block
                        :loading="connectionStore.probing"
                        data-testid="connection-probe-button"
                        @click="runProbe"
                    >
                        {{ t.connection.probe.action }}
                    </Button>
                    <p
                        v-if="probeStatus"
                        class="rounded-2xl border px-3 py-2 text-xs leading-5"
                        :class="probeStatus.tone === 'success'
                            ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100'
                            : 'border-rose-400/25 bg-rose-400/10 text-rose-100'"
                        role="status"
                    >
                        {{ probeStatus.text }}
                    </p>
                </div>
            </div>

            <ul
                v-if="activeIssues.length"
                class="grid gap-2"
            >
                <li
                    v-for="issue in activeIssues"
                    :key="issue.id"
                    class="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100"
                >
                    {{ issue.message }}
                </li>
            </ul>

            <div class="grid gap-3">
                <Button
                    type="submit"
                    block
                    data-testid="connection-apply-button"
                >
                    {{ t.connection.actions.apply }}
                </Button>

                <div class="grid gap-2 sm:grid-cols-3">
                    <Button
                        variant="secondary"
                        block
                        @click="resetDraft"
                    >
                        {{ t.connection.actions.resetDraft }}
                    </Button>
                    <Button
                        variant="outline"
                        block
                        @click="clearKey"
                    >
                        {{ t.connection.actions.clearKey }}
                    </Button>
                    <Button
                        variant="ghost"
                        block
                        @click="clearAll"
                    >
                        {{ t.connection.actions.clearAll }}
                    </Button>
                </div>
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
                        {{ translateDraftIssue(issue) }}
                    </li>
                </ul>
            </div>
        </form>

        <section class="rounded-[1.75rem] border border-white/10 bg-neutral-900/82 p-4 shadow-[0_24px_120px_rgba(0,0,0,0.32)] sm:p-5">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div class="min-w-0">
                    <p class="text-sm font-semibold text-white">
                        {{ t.connection.preset.title }}
                    </p>
                    <p class="mt-1 text-sm leading-6 text-neutral-400">
                        {{ t.connection.preset.description }}
                    </p>
                </div>
                <Button
                    type="button"
                    variant="secondary"
                    class="shrink-0"
                    @click="triggerPresetImport"
                >
                    {{ t.connection.preset.importAction }}
                </Button>
            </div>

            <input
                ref="presetFileInput"
                type="file"
                accept=".json,application/json"
                class="hidden"
                @change="handlePresetFileChange"
            >

            <div
                v-if="presetStore.hasPresets"
                class="mt-4 grid gap-3"
            >
                <Select
                    :model-value="presetStore.selectedPresetId ?? ''"
                    :options="presetOptions"
                    :label="t.connection.preset.selectLabel"
                    :placeholder="t.connection.preset.selectPlaceholder"
                    @update:model-value="updateSelectedPreset"
                />

                <div
                    v-if="selectedPresetSummary"
                    class="rounded-2xl border border-white/8 bg-white/5 px-3 py-3 text-sm leading-6 text-neutral-300"
                >
                    <p>{{ selectedPresetSummary.prompts }}</p>
                    <p
                        v-if="selectedPresetSummary.sampling"
                        class="mt-1 text-xs text-neutral-400"
                    >
                        {{ t.connection.preset.samplingLabel }}: {{ selectedPresetSummary.sampling }}
                    </p>
                    <div
                        v-if="selectedPresetSummary.warnings.length"
                        class="mt-2 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100"
                    >
                        <p class="font-medium">
                            {{ t.connection.preset.warningsTitle }}
                        </p>
                        <ul class="mt-1 space-y-0.5">
                            <li
                                v-for="(warning, warningIndex) in selectedPresetSummary.warnings.slice(0, 4)"
                                :key="warningIndex"
                            >
                                {{ warning }}
                            </li>
                        </ul>
                    </div>
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        class="mt-2"
                        @click="removeSelectedPreset"
                    >
                        {{ t.connection.preset.removeAction }}
                    </Button>
                </div>
            </div>

            <p
                v-if="presetNotice"
                class="mt-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs leading-5 text-neutral-300"
                role="status"
            >
                {{ presetNotice }}
            </p>
        </section>

        <section
            v-if="activeStatus === 'ready-to-attempt'"
            class="rounded-[1.75rem] border p-4 shadow-[0_24px_120px_rgba(0,0,0,0.32)] sm:p-5"
            :class="statusSurfaceClass('success')"
        >
            <p class="text-sm font-semibold">
                {{ t.connection.nextStepTitle }}
            </p>
            <p class="mt-2 text-sm leading-6 opacity-85">
                {{ t.connection.nextStepDescription }}
            </p>
            <RouterLink
                to="/chat"
                class="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-300/15 px-4 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/25"
            >
                {{ t.connection.actions.continueChat }}
            </RouterLink>
        </section>

        <section class="rounded-[1.75rem] border border-white/10 bg-neutral-900/82 p-4 shadow-[0_24px_120px_rgba(0,0,0,0.32)] sm:p-5">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <p class="text-sm font-semibold text-white">
                        {{ t.connection.appliedConfiguration }}
                    </p>
                    <p class="mt-1 text-sm leading-6 text-neutral-400">
                        {{ t.connection.handoffTitle }}
                    </p>
                </div>
                <span
                    class="inline-flex rounded-full border px-3 py-1 text-xs font-medium"
                    :class="statusBadgeClass(runtimeStatusCopy.tone)"
                >
                    {{ runtimeStatusCopy.label }}
                </span>
            </div>

            <dl
                v-if="appliedSummary.length"
                class="mt-4 grid gap-3 sm:grid-cols-2"
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
                {{ t.connection.messages.noAppliedDraft }}
            </p>
        </section>
    </section>
</template>
