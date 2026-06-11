<script setup lang="ts">
import { computed, ref } from 'vue';
import { Button, Collapse, Textarea } from '@/ui-kit';
import { useI18n } from '@/i18n';
import { useWorldbookStore } from '@/stores';
import { createChatLorebookContext, createWorldbookImportInputFromFile } from '@/services';
import type { ReforgedChatLorebookContext, ReforgedChatLorebookEntryContext } from '@/contracts/chat';
import type {
    ReforgedWorldbookEntry,
    ReforgedWorldbookImportResult,
    ReforgedWorldbookLibraryItem,
} from '@/contracts/worldbook';

type NoticeTone = 'neutral' | 'success' | 'danger';

interface ViewNotice {
    tone: NoticeTone;
    message: string;
}

interface WorldbookSummary {
    totalEntries: number;
    enabledEntries: number;
    constantEntries: number;
    injectionReadyEntries: number;
    entriesWithPrimaryKeys: number;
    entriesWithoutPrimaryKeys: number;
}

const PREVIEW_LIMIT = 5;
const ENTRY_SAMPLE_LIMIT = 8;

const { t, locale } = useI18n();
const worldbookStore = useWorldbookStore();
const fileInput = ref<HTMLInputElement | null>(null);
const importBusy = ref(false);
const notice = ref<ViewNotice | null>(null);
const previewScanText = ref('');

const selectedWorldbook = computed(() => worldbookStore.selectedWorldbook);
const selectedEntries = computed(() => selectedWorldbook.value?.worldbook.entries ?? []);
const selectedWarnings = computed(() => selectedWorldbook.value?.warnings ?? []);
const enabledEntrySamples = computed(() => selectedEntries.value
    .filter((entry) => entry.enabled)
    .slice(0, ENTRY_SAMPLE_LIMIT));

const worldbookSummary = computed<WorldbookSummary>(() => summarizeWorldbookEntries(selectedEntries.value));

const activeLorebookPreview = computed<ReforgedChatLorebookContext | null>(() => {
    if (!selectedWorldbook.value) {
        return null;
    }

    return createChatLorebookContext(selectedWorldbook.value, {
        generationTrigger: 'normal',
        scanText: previewScanText.value,
        tokenBudget: null,
        random: () => 0.5,
    });
});

const activePreviewEntries = computed(() => activeLorebookPreview.value?.entries.slice(0, PREVIEW_LIMIT) ?? []);
const activePreviewCount = computed(() => activeLorebookPreview.value?.entries.length ?? 0);
const routedPreviewSummary = computed(() => summarizeRoutedPreview(activeLorebookPreview.value));

const librarySummary = computed(() => {
    const totalEntries = worldbookStore.worldbooks.reduce((total, item) => total + item.worldbook.entries.length, 0);
    const enabledEntries = worldbookStore.worldbooks.reduce(
        (total, item) => total + item.worldbook.entries.filter((entry) => entry.enabled).length,
        0,
    );

    return {
        totalBooks: worldbookStore.worldbooks.length,
        totalEntries,
        enabledEntries,
    };
});

function openFilePicker(): void {
    fileInput.value?.click();
}

async function importWorldbookFromFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
        return;
    }

    importBusy.value = true;
    notice.value = null;

    try {
        const result = worldbookStore.importWorldbook(await createWorldbookImportInputFromFile(file));
        handleImportResult(result);
    } catch (error) {
        notice.value = {
            tone: 'danger',
            message: t.value.worldbooks.importFailed(describeError(error)),
        };
    } finally {
        importBusy.value = false;
        input.value = '';
    }
}

function handleImportResult(result: ReforgedWorldbookImportResult): void {
    if (!result.ok) {
        notice.value = {
            tone: 'danger',
            message: result.message,
        };
        return;
    }

    notice.value = {
        tone: 'success',
        message: t.value.worldbooks.imported(result.worldbook.name, result.worldbook.entries.length, result.warnings.length),
    };
}

function selectWorldbook(item: ReforgedWorldbookLibraryItem): void {
    if (!worldbookStore.selectWorldbook(item.id)) {
        return;
    }

    notice.value = {
        tone: 'neutral',
        message: t.value.worldbooks.selectedNow(item.worldbook.name),
    };
}

function removeWorldbook(item: ReforgedWorldbookLibraryItem): void {
    if (!worldbookStore.removeWorldbook(item.id)) {
        return;
    }

    notice.value = {
        tone: 'neutral',
        message: t.value.worldbooks.removed(item.worldbook.name),
    };
}

function clearWorldbooks(): void {
    if (!worldbookStore.hasWorldbooks) {
        return;
    }

    worldbookStore.clearWorldbooks();
    previewScanText.value = '';
    notice.value = {
        tone: 'neutral',
        message: t.value.worldbooks.libraryCleared,
    };
}

function summarizeWorldbookEntries(entries: ReforgedWorldbookEntry[]): WorldbookSummary {
    const enabledEntries = entries.filter((entry) => entry.enabled);
    const constantEntries = enabledEntries.filter((entry) => entry.constant).length;
    const injectionReadyEntries = enabledEntries.filter(isEntryInjectionReady).length;
    const entriesWithPrimaryKeys = entries.filter((entry) => entry.primaryKeys.length > 0).length;

    return {
        totalEntries: entries.length,
        enabledEntries: enabledEntries.length,
        constantEntries,
        injectionReadyEntries,
        entriesWithPrimaryKeys,
        entriesWithoutPrimaryKeys: entries.length - entriesWithPrimaryKeys,
    };
}

function isEntryInjectionReady(entry: ReforgedWorldbookEntry): boolean {
    return entry.enabled && Boolean(entry.content.trim()) && (entry.constant || entry.primaryKeys.length > 0);
}

function summarizeRoutedPreview(lorebook: ReforgedChatLorebookContext | null): string {
    if (!lorebook) {
        return t.value.worldbooks.noActiveWorldbook;
    }

    const outletCount = Object.values(lorebook.outletEntries ?? {}).reduce((total, entries) => total + entries.length, 0);
    const depthCount = (lorebook.depthEntries ?? []).reduce((total, group) => total + group.entries.length, 0);
    const parts = [
        t.value.worldbooks.routedPreview.before(lorebook.beforeEntries?.length ?? 0),
        t.value.worldbooks.routedPreview.after(lorebook.afterEntries?.length ?? 0),
        t.value.worldbooks.routedPreview.authorNote((lorebook.authorNoteBeforeEntries?.length ?? 0) + (lorebook.authorNoteAfterEntries?.length ?? 0)),
        t.value.worldbooks.routedPreview.example(lorebook.exampleEntries?.length ?? 0),
        t.value.worldbooks.routedPreview.depth(depthCount),
        t.value.worldbooks.routedPreview.outlet(outletCount),
    ];

    return parts.join(' · ');
}

function describeEntryTitle(entry: ReforgedWorldbookEntry): string {
    return entry.comment.trim() || entry.primaryKeys.join(', ') || t.value.worldbooks.entryTitle(entry.id);
}

function describePreviewTitle(entry: ReforgedChatLorebookEntryContext): string {
    return entry.title?.trim() || t.value.worldbooks.entryTitle(entry.id);
}

function describeEntryKeys(entry: ReforgedWorldbookEntry): string {
    if (entry.constant) {
        return t.value.worldbooks.constant;
    }

    if (entry.primaryKeys.length) {
        return entry.primaryKeys.slice(0, 4).join(', ');
    }

    return t.value.worldbooks.noPrimaryKeys;
}

function describeSource(item: ReforgedWorldbookLibraryItem): string {
    return `${item.source.fileName} · ${item.source.format.toUpperCase()} · ${item.worldbook.source}`;
}

function formatImportedAt(value: string): string {
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

function describeError(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

function noticeClasses(tone: NoticeTone): string {
    const toneClass: Record<NoticeTone, string> = {
        neutral: 'border-white/10 bg-white/[0.06] text-neutral-200',
        success: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100',
        danger: 'border-rose-300/25 bg-rose-300/10 text-rose-100',
    };

    return [
        'rounded-2xl border px-4 py-3 text-sm leading-6',
        toneClass[tone],
    ].join(' ');
}

function libraryItemClasses(item: ReforgedWorldbookLibraryItem): string {
    const selected = item.id === selectedWorldbook.value?.id;

    return [
        'rounded-2xl border p-4 text-left transition duration-200',
        selected
            ? 'border-emerald-300/50 bg-emerald-300/10 shadow-[0_16px_50px_rgba(16,185,129,0.12)]'
            : 'border-white/10 bg-white/[0.04] hover:border-white/18 hover:bg-white/[0.07]',
    ].join(' ');
}
</script>

<template>
    <section class="mx-auto flex w-full max-w-7xl flex-col gap-5 pb-6">
        <header class="rounded-[1.75rem] border border-white/10 bg-neutral-900/88 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.34)] sm:p-6">
            <div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div class="min-w-0">
                    <p class="text-xs font-black uppercase tracking-[0.22em] text-cyan-200/80">
                        {{ t.worldbooks.headerEyebrow }}
                    </p>
                    <h1 class="mt-3 text-3xl font-black tracking-[-0.03em] text-white sm:text-4xl">
                        {{ t.worldbooks.headerTitle }}
                    </h1>
                    <p class="mt-3 max-w-3xl text-sm leading-7 text-neutral-300">
                        {{ t.worldbooks.headerDescription }}
                    </p>
                </div>

                <dl class="grid grid-cols-3 gap-2 sm:min-w-[24rem]">
                    <div class="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
                        <dt class="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-neutral-500">
                            {{ t.worldbooks.stats.books }}
                        </dt>
                        <dd class="mt-1 text-2xl font-black text-white">
                            {{ librarySummary.totalBooks }}
                        </dd>
                    </div>
                    <div class="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
                        <dt class="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-neutral-500">
                            {{ t.worldbooks.stats.entries }}
                        </dt>
                        <dd class="mt-1 text-2xl font-black text-white">
                            {{ librarySummary.totalEntries }}
                        </dd>
                    </div>
                    <div class="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
                        <dt class="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-neutral-500">
                            {{ t.worldbooks.stats.enabled }}
                        </dt>
                        <dd class="mt-1 text-2xl font-black text-emerald-100">
                            {{ librarySummary.enabledEntries }}
                        </dd>
                    </div>
                </dl>
            </div>
        </header>

        <div class="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
            <aside class="flex min-w-0 flex-col gap-5">
                <section class="rounded-[1.75rem] border border-white/10 bg-neutral-900/88 p-4 shadow-[0_24px_90px_rgba(0,0,0,0.28)] sm:p-5">
                    <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <p class="text-xs font-black uppercase tracking-[0.2em] text-neutral-500">
                                {{ t.worldbooks.importEyebrow }}
                            </p>
                            <h2 class="mt-2 text-xl font-black tracking-[-0.02em] text-white">
                                {{ t.worldbooks.importTitle }}
                            </h2>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            :disabled="!worldbookStore.hasWorldbooks"
                            @click="clearWorldbooks"
                        >
                            {{ t.worldbooks.clearLibrary }}
                        </Button>
                    </div>

                    <input
                        ref="fileInput"
                        class="sr-only"
                        data-testid="worldbook-file-input"
                        type="file"
                        accept=".json,application/json"
                        @change="importWorldbookFromFile"
                    >

                    <button
                        type="button"
                        class="mt-4 flex min-h-36 w-full flex-col items-center justify-center gap-3 rounded-[1.5rem] border border-dashed border-cyan-300/30 bg-cyan-300/8 px-4 py-6 text-center text-cyan-50 transition hover:border-cyan-200/50 hover:bg-cyan-300/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 disabled:cursor-wait disabled:opacity-60"
                        :disabled="importBusy"
                        @click="openFilePicker"
                    >
                        <span
                            class="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-200/30 bg-cyan-200/14 text-2xl font-black"
                            aria-hidden="true"
                        >
                            +
                        </span>
                        <span class="text-sm font-bold">
                            {{ importBusy ? t.worldbooks.importBusy : t.worldbooks.chooseJson }}
                        </span>
                        <span class="max-w-sm text-xs leading-5 text-cyan-100/72">
                            {{ t.worldbooks.importHint }}
                        </span>
                    </button>

                    <p
                        v-if="notice"
                        :class="['mt-4', noticeClasses(notice.tone)]"
                    >
                        {{ notice.message }}
                    </p>
                </section>

                <section class="rounded-[1.75rem] border border-white/10 bg-neutral-900/88 p-4 shadow-[0_24px_90px_rgba(0,0,0,0.28)] sm:p-5">
                    <div class="mb-4 flex items-center justify-between gap-3">
                        <div>
                            <p class="text-xs font-black uppercase tracking-[0.2em] text-neutral-500">
                                {{ t.worldbooks.libraryEyebrow }}
                            </p>
                            <h2 class="mt-2 text-xl font-black tracking-[-0.02em] text-white">
                                {{ t.worldbooks.activeSelection }}
                            </h2>
                        </div>
                        <span
                            v-if="selectedWorldbook"
                            class="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-xs font-bold text-emerald-100"
                        >
                            {{ t.worldbooks.selected }}
                        </span>
                    </div>

                    <div
                        v-if="worldbookStore.worldbooks.length"
                        class="max-h-[34rem] space-y-3 overflow-y-auto pr-1"
                    >
                        <article
                            v-for="worldbook in worldbookStore.worldbooks"
                            :key="worldbook.id"
                            :class="libraryItemClasses(worldbook)"
                        >
                            <div class="flex items-start gap-3">
                                <button
                                    type="button"
                                    class="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
                                    @click="selectWorldbook(worldbook)"
                                >
                                    <span class="flex items-center gap-2">
                                        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-200 to-cyan-200 text-sm font-black text-neutral-950">
                                            {{ t.worldbooks.iconLabel }}
                                        </span>
                                        <span class="min-w-0">
                                            <span class="block truncate text-sm font-black text-white">
                                                {{ worldbook.worldbook.name }}
                                            </span>
                                            <span class="mt-0.5 block truncate text-xs text-neutral-400">
                                                {{ describeSource(worldbook) }}
                                            </span>
                                        </span>
                                    </span>
                                </button>

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    :aria-label="t.worldbooks.removeAria"
                                    @click="removeWorldbook(worldbook)"
                                >
                                    {{ t.worldbooks.remove }}
                                </Button>
                            </div>

                            <div class="mt-4 grid grid-cols-3 gap-2 text-xs">
                                <div class="rounded-xl border border-white/8 bg-black/18 px-3 py-2">
                                    <p class="font-bold text-neutral-500">
                                        {{ t.worldbooks.stats.entries }}
                                    </p>
                                    <p class="mt-1 text-base font-black text-white">
                                        {{ worldbook.worldbook.entries.length }}
                                    </p>
                                </div>
                                <div class="rounded-xl border border-white/8 bg-black/18 px-3 py-2">
                                    <p class="font-bold text-neutral-500">
                                        {{ t.worldbooks.stats.enabled }}
                                    </p>
                                    <p class="mt-1 text-base font-black text-emerald-100">
                                        {{ worldbook.worldbook.entries.filter((entry) => entry.enabled).length }}
                                    </p>
                                </div>
                                <div class="rounded-xl border border-white/8 bg-black/18 px-3 py-2">
                                    <p class="font-bold text-neutral-500">
                                        {{ t.worldbooks.stats.added }}
                                    </p>
                                    <p class="mt-1 truncate text-sm font-bold text-neutral-200">
                                        {{ formatImportedAt(worldbook.importedAt) }}
                                    </p>
                                </div>
                            </div>
                        </article>
                    </div>

                    <div
                        v-else
                        class="rounded-[1.5rem] border border-dashed border-white/15 bg-white/[0.03] p-5 text-sm leading-6 text-neutral-400"
                    >
                        {{ t.worldbooks.emptyLibrary }}
                    </div>
                </section>
            </aside>

            <main class="min-w-0">
                <section class="rounded-[1.75rem] border border-white/10 bg-neutral-900/88 p-4 shadow-[0_24px_90px_rgba(0,0,0,0.28)] sm:p-5">
                    <div
                        v-if="selectedWorldbook"
                        class="flex flex-col gap-5"
                    >
                        <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                            <div class="min-w-0">
                                <p class="text-xs font-black uppercase tracking-[0.2em] text-neutral-500">
                                    {{ t.worldbooks.currentWorldbook }}
                                </p>
                                <h2 class="mt-2 truncate text-2xl font-black tracking-[-0.02em] text-white">
                                    {{ selectedWorldbook.worldbook.name }}
                                </h2>
                                <p class="mt-2 text-sm leading-6 text-neutral-400">
                                    {{ describeSource(selectedWorldbook) }}
                                </p>
                            </div>
                            <div class="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[28rem]">
                                <div class="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
                                    <p class="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-neutral-500">
                                        {{ t.worldbooks.stats.total }}
                                    </p>
                                    <p class="mt-1 text-2xl font-black text-white">
                                        {{ worldbookSummary.totalEntries }}
                                    </p>
                                </div>
                                <div class="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
                                    <p class="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-neutral-500">
                                        {{ t.worldbooks.stats.enabled }}
                                    </p>
                                    <p class="mt-1 text-2xl font-black text-emerald-100">
                                        {{ worldbookSummary.enabledEntries }}
                                    </p>
                                </div>
                                <div class="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
                                    <p class="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-neutral-500">
                                        {{ t.worldbooks.stats.constant }}
                                    </p>
                                    <p class="mt-1 text-2xl font-black text-amber-100">
                                        {{ worldbookSummary.constantEntries }}
                                    </p>
                                </div>
                                <div class="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
                                    <p class="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-neutral-500">
                                        {{ t.worldbooks.stats.ready }}
                                    </p>
                                    <p class="mt-1 text-2xl font-black text-cyan-100">
                                        {{ worldbookSummary.injectionReadyEntries }}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div
                            v-if="selectedWarnings.length"
                            class="rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3"
                        >
                            <p class="text-xs font-black uppercase tracking-[0.18em] text-amber-100">
                                {{ t.worldbooks.importWarnings }}
                            </p>
                            <ul class="mt-2 space-y-1 text-sm leading-6 text-amber-50/88">
                                <li
                                    v-for="warning in selectedWarnings"
                                    :key="warning"
                                >
                                    {{ warning }}
                                </li>
                            </ul>
                        </div>

                        <div class="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                            <section class="min-w-0 rounded-[1.5rem] border border-white/10 bg-black/18 p-4">
                                <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                        <h3 class="text-base font-black text-white">
                                            {{ t.worldbooks.keyCoverage }}
                                        </h3>
                                        <p class="mt-1 text-sm leading-6 text-neutral-400">
                                            {{ t.worldbooks.keyCoverageDescription }}
                                        </p>
                                    </div>
                                    <span class="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-bold text-neutral-200">
                                        {{ t.worldbooks.keyedCount(worldbookSummary.entriesWithPrimaryKeys) }}
                                    </span>
                                </div>
                                <div class="mt-4 grid grid-cols-2 gap-2">
                                    <div class="rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-3">
                                        <p class="text-xs font-bold text-neutral-500">
                                            {{ t.worldbooks.hasPrimaryKey }}
                                        </p>
                                        <p class="mt-1 text-xl font-black text-white">
                                            {{ worldbookSummary.entriesWithPrimaryKeys }}
                                        </p>
                                    </div>
                                    <div class="rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-3">
                                        <p class="text-xs font-bold text-neutral-500">
                                            {{ t.worldbooks.noPrimaryKeyStat }}
                                        </p>
                                        <p class="mt-1 text-xl font-black text-neutral-300">
                                            {{ worldbookSummary.entriesWithoutPrimaryKeys }}
                                        </p>
                                    </div>
                                </div>
                            </section>

                            <section class="min-w-0 rounded-[1.5rem] border border-white/10 bg-black/18 p-4">
                                <h3 class="text-base font-black text-white">
                                    {{ t.worldbooks.injectionPreview }}
                                </h3>
                                <p class="mt-1 text-sm leading-6 text-neutral-400">
                                    {{ t.worldbooks.injectionPreviewDescription }}
                                </p>
                                <Textarea
                                    v-model="previewScanText"
                                    class="mt-4"
                                    :label="t.worldbooks.previewScanText"
                                    :placeholder="t.worldbooks.previewPlaceholder"
                                    :rows="4"
                                />
                                <div class="mt-3 rounded-2xl border border-cyan-300/18 bg-cyan-300/8 px-4 py-3">
                                    <p class="text-xs font-black uppercase tracking-[0.18em] text-cyan-100">
                                        {{ t.worldbooks.activePreviewEntries(activePreviewCount) }}
                                    </p>
                                    <p class="mt-2 text-xs leading-5 text-cyan-50/78">
                                        {{ routedPreviewSummary }}
                                    </p>
                                </div>
                            </section>
                        </div>

                        <section class="rounded-[1.5rem] border border-white/10 bg-black/18 p-4">
                            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                    <h3 class="text-base font-black text-white">
                                        {{ t.worldbooks.promptCandidates }}
                                    </h3>
                                    <p class="mt-1 text-sm leading-6 text-neutral-400">
                                        {{ t.worldbooks.promptCandidatesDescription }}
                                    </p>
                                </div>
                                <span class="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-bold text-neutral-200">
                                    {{ t.worldbooks.showingCount(Math.min(enabledEntrySamples.length, ENTRY_SAMPLE_LIMIT)) }}
                                </span>
                            </div>

                            <div
                                v-if="activePreviewEntries.length"
                                class="mt-4 grid gap-3"
                            >
                                <article
                                    v-for="entry in activePreviewEntries"
                                    :key="entry.id"
                                    class="rounded-2xl border border-emerald-300/18 bg-emerald-300/8 p-4"
                                >
                                    <p class="truncate text-sm font-black text-emerald-50">
                                        {{ describePreviewTitle(entry) }}
                                    </p>
                                    <p class="mt-2 line-clamp-3 text-sm leading-6 text-emerald-50/78">
                                        {{ entry.content || t.worldbooks.noPromptContent }}
                                    </p>
                                </article>
                            </div>

                            <div
                                v-else
                                class="mt-4 rounded-2xl border border-dashed border-white/12 bg-white/[0.03] p-4 text-sm leading-6 text-neutral-400"
                            >
                                {{ t.worldbooks.noPreviewEntries }}
                            </div>

                            <Collapse
                                class="mt-4"
                                :title="t.worldbooks.enabledSamplesTitle"
                                :description="t.worldbooks.enabledSamplesDescription"
                            >
                                <div
                                    v-if="enabledEntrySamples.length"
                                    class="grid gap-3"
                                >
                                    <article
                                        v-for="entry in enabledEntrySamples"
                                        :key="entry.id"
                                        class="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                                    >
                                        <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                            <div class="min-w-0">
                                                <p class="truncate text-sm font-black text-white">
                                                    {{ describeEntryTitle(entry) }}
                                                </p>
                                                <p class="mt-1 truncate text-xs text-neutral-400">
                                                    {{ describeEntryKeys(entry) }} · {{ entry.position }}
                                                </p>
                                            </div>
                                            <span
                                                v-if="entry.constant"
                                                class="w-fit rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-xs font-bold text-amber-100"
                                            >
                                                {{ t.worldbooks.constant }}
                                            </span>
                                        </div>
                                        <p class="mt-3 line-clamp-3 text-sm leading-6 text-neutral-300">
                                            {{ entry.content || t.worldbooks.noPromptContent }}
                                        </p>
                                    </article>
                                </div>

                                <p
                                    v-else
                                    class="rounded-2xl border border-dashed border-white/12 bg-white/[0.03] p-4 text-sm leading-6 text-neutral-400"
                                >
                                    {{ t.worldbooks.noEnabledEntries }}
                                </p>
                            </Collapse>
                        </section>
                    </div>

                    <div
                        v-else
                        class="rounded-[1.5rem] border border-dashed border-white/15 bg-white/[0.03] p-6 text-center"
                    >
                        <p class="text-lg font-black text-white">
                            {{ t.worldbooks.selectOrImportTitle }}
                        </p>
                        <p class="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-400">
                            {{ t.worldbooks.selectOrImportDescription }}
                        </p>
                    </div>
                </section>
            </main>
        </div>
    </section>
</template>
