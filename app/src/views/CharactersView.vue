<script setup lang="ts">
import { computed, ref } from 'vue';
import { Button, Collapse } from '@/ui-kit';
import { useI18n } from '@/i18n';
import { useCharacterStore } from '@/stores';
import { createCharacterImportInputFromFile } from '@/services/characterFileImportService';
import type {
  ReforgedCharacterCardPngParseReason,
  ReforgedCharacterImportResult,
  ReforgedCharacterRosterItem,
} from '@/contracts/character';

const { t, locale } = useI18n();
const characterStore = useCharacterStore();
const fileInput = ref<HTMLInputElement | null>(null);
const importBusy = ref(false);
const importNotice = ref<string | null>(null);
const importNoticeTone = ref<'neutral' | 'success' | 'danger'>('neutral');

const selectedCharacter = computed(() => characterStore.selectedCharacter);
const lastImportResult = computed(() => characterStore.lastImportResult);
const hasCharacters = computed(() => characterStore.hasCharacters);
const importResultTone = computed(() => {
  if (importNotice.value) {
    return importNoticeTone.value;
  }

  if (!lastImportResult.value) {
    return 'neutral';
  }

  return lastImportResult.value.ok ? 'success' : 'danger';
});

const selectedSummary = computed(() => {
  const character = selectedCharacter.value;

  if (!character) {
    return t.value.characters.selectedSummaryFallback;
  }

  return character.card.description || character.card.scenario || character.card.firstMessage || t.value.characters.noSummary;
});

function openFilePicker(): void {
  fileInput.value?.click();
}

async function importCardFromFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (!file) {
    return;
  }

  importBusy.value = true;
  importNotice.value = null;
  importNoticeTone.value = 'neutral';

  try {
    const result = characterStore.importCharacter(
      await createCharacterImportInputFromFile(file),
      new Date().toISOString(),
    );

    handleImportResult(result);
  } catch (error) {
    importNotice.value = t.value.characters.importFailed(describeError(error));
    importNoticeTone.value = 'danger';
  } finally {
    importBusy.value = false;
    input.value = '';
  }
}

function handleImportResult(result: ReforgedCharacterImportResult): void {
  if (!result.ok) {
    importNotice.value = t.value.characters.importFailed(result.message);
    importNoticeTone.value = 'danger';
    return;
  }

  importNotice.value = result.warnings.length > 0
    ? t.value.characters.importedWithWarnings(result.card.name, result.warnings.length)
    : t.value.characters.importedAndSelected(result.card.name);
  importNoticeTone.value = 'success';
}

function selectCharacter(characterId: string): void {
  const selected = characterStore.selectCharacter(characterId);

  if (!selected) {
    importNotice.value = t.value.characters.characterMissing;
    importNoticeTone.value = 'danger';
  }
}

function removeCharacter(characterId: string): void {
  const removed = characterStore.removeCharacter(characterId);

  if (removed) {
    importNotice.value = characterStore.selectedCharacter
      ? t.value.characters.removedWithSelection(characterStore.selectedCharacter.card.name)
      : t.value.characters.removedEmpty;
    importNoticeTone.value = 'neutral';
  }
}

function clearCharacters(): void {
  characterStore.clearCharacters();
  importNotice.value = t.value.characters.rosterCleared;
  importNoticeTone.value = 'neutral';
}

function characterInitial(character: ReforgedCharacterRosterItem): string {
  return character.card.name.trim().slice(0, 1).toUpperCase() || t.value.characters.unknownInitial;
}

function characterDescription(character: ReforgedCharacterRosterItem): string {
  return character.card.description || character.card.scenario || character.card.firstMessage || t.value.characters.noDescription;
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

function formatSource(character: ReforgedCharacterRosterItem): string {
  return `${character.source.format.toUpperCase()} - ${character.source.fileName}`;
}

function formatWarningCount(character: ReforgedCharacterRosterItem): string {
  if (character.warnings.length === 0) {
    return t.value.characters.noWarnings;
  }

  return t.value.characters.warningCount(character.warnings.length);
}

function advancedFields(character: ReforgedCharacterRosterItem): Array<{ label: string; value: string }> {
  return [
    { label: t.value.characters.advancedFields.personality, value: character.card.personality },
    { label: t.value.characters.advancedFields.scenario, value: character.card.scenario },
    { label: t.value.characters.advancedFields.tags, value: character.card.tags.join(', ') },
    { label: t.value.characters.advancedFields.alternateGreetings, value: character.card.alternateGreetings.join('\n\n') },
    { label: t.value.characters.advancedFields.rawVersion, value: character.card.rawVersion },
    { label: t.value.characters.advancedFields.parserSource, value: character.card.source },
    { label: t.value.characters.advancedFields.extensions, value: formatExtensions(character.card.extensions) },
  ].filter((field) => field.value.trim().length > 0);
}

function formatExtensions(extensions: Record<string, unknown>): string {
  const entries = Object.keys(extensions);

  if (entries.length === 0) {
    return '';
  }

  return entries.join(', ');
}

function describeReasons(reasons: ReforgedCharacterCardPngParseReason[]): string[] {
  return reasons.map((reason) => {
    const context = [reason.chunkType, reason.keyword].filter(Boolean).join(' / ');
    return context ? `${reason.message} (${context})` : reason.message;
  });
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
</script>

<template>
  <section class="mx-auto grid w-full max-w-6xl gap-4 pb-6 sm:gap-5">
    <header class="rounded-[1.75rem] border border-white/10 bg-neutral-900/92 px-4 py-5 shadow-[0_24px_120px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:px-5">
      <div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div class="min-w-0">
          <p class="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-cyan-200/75">
            {{ t.characters.headerEyebrow }}
          </p>
          <h1 class="mt-2 font-display text-2xl font-semibold tracking-normal text-neutral-50 sm:text-3xl">
            {{ t.characters.headerTitle }}
          </h1>
          <p class="mt-3 max-w-3xl text-sm leading-6 text-neutral-400">
            {{ t.characters.headerDescription }}
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <span class="rounded-2xl border border-white/10 bg-white/6 px-3 py-2 text-center text-xs font-medium text-neutral-300">
            {{ t.characters.importedCount(characterStore.characters.length) }}
          </span>
          <span
            class="rounded-2xl border px-3 py-2 text-center text-xs font-medium"
            :class="selectedCharacter ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100' : 'border-amber-400/20 bg-amber-400/10 text-amber-100'"
          >
            {{ selectedCharacter ? t.characters.readyForChat : t.characters.noSelection }}
          </span>
          <Button
            :loading="importBusy"
            @click="openFilePicker"
          >
            {{ t.characters.chooseCard }}
          </Button>
        </div>
      </div>

      <input
        ref="fileInput"
        class="sr-only"
        data-testid="character-file-input"
        type="file"
        accept=".json,.png,application/json,image/png"
        @change="importCardFromFile"
      >

      <p class="mt-4 text-xs leading-5 text-neutral-500">
        {{ t.characters.importHint }}
      </p>

      <div
        v-if="importNotice || lastImportResult"
        class="mt-4 rounded-[1.15rem] border px-4 py-3 text-sm leading-6"
        :class="{
          'border-white/10 bg-white/6 text-neutral-300': importResultTone === 'neutral',
          'border-emerald-400/20 bg-emerald-400/10 text-emerald-100': importResultTone === 'success',
          'border-rose-400/20 bg-rose-400/10 text-rose-100': importResultTone === 'danger',
        }"
      >
        <p class="font-medium">
          {{ importNotice || (lastImportResult?.ok ? t.characters.importComplete : lastImportResult?.message) }}
        </p>
        <p
          v-if="lastImportResult?.ok"
          class="mt-1 break-words text-xs opacity-80"
        >
          {{ lastImportResult.source.fileName }} - {{ lastImportResult.source.format.toUpperCase() }}
        </p>
        <ul
          v-if="lastImportResult && !lastImportResult.ok && lastImportResult.reasons.length > 0"
          class="mt-2 space-y-1 text-xs opacity-85"
        >
          <li
            v-for="reason in describeReasons(lastImportResult.reasons)"
            :key="reason"
          >
            {{ reason }}
          </li>
        </ul>
        <ul
          v-if="lastImportResult?.ok && lastImportResult.warnings.length > 0"
          class="mt-2 space-y-1 text-xs opacity-85"
        >
          <li
            v-for="warning in describeReasons(lastImportResult.warnings)"
            :key="warning"
          >
            {{ warning }}
          </li>
        </ul>
      </div>
    </header>

    <section class="rounded-[1.75rem] border border-white/10 bg-neutral-900/88 p-4 shadow-[0_18px_70px_rgba(0,0,0,0.32)] sm:p-5">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-cyan-200/75">
            {{ t.characters.rosterEyebrow }}
          </p>
          <h2 class="mt-1 text-lg font-semibold text-neutral-50">
            {{ t.characters.rosterTitle }}
          </h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          :disabled="!hasCharacters"
          @click="clearCharacters"
        >
          {{ t.characters.clear }}
        </Button>
      </div>

      <div
        v-if="hasCharacters"
        class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        <article
          v-for="character in characterStore.characters"
          :key="character.id"
          class="min-w-0 rounded-[1.25rem] border bg-neutral-950/58 p-4 transition"
          :class="character.id === selectedCharacter?.id ? 'border-cyan-300/45 shadow-[0_0_0_1px_rgba(103,232,249,0.14)]' : 'border-white/10'"
        >
          <button
            type="button"
            class="flex min-w-0 gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
            @click="selectCharacter(character.id)"
          >
            <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/8 text-base font-semibold text-cyan-100">
              {{ characterInitial(character) }}
            </span>
            <span class="min-w-0 flex-1">
              <span class="flex min-w-0 flex-wrap items-center gap-2">
                <span class="truncate text-sm font-semibold text-neutral-100">
                  {{ character.card.name }}
                </span>
                <span
                  v-if="character.id === selectedCharacter?.id"
                  class="rounded-full border border-cyan-300/25 bg-cyan-300/12 px-2 py-0.5 text-[0.65rem] font-medium text-cyan-100"
                >
                  {{ t.characters.selected }}
                </span>
              </span>
              <span class="mt-1 line-clamp-3 text-xs leading-5 text-neutral-400">
                {{ characterDescription(character) }}
              </span>
            </span>
          </button>

          <div class="mt-4 flex flex-wrap gap-2 text-[0.68rem] font-medium text-neutral-400">
            <span class="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
              {{ formatSource(character) }}
            </span>
            <span class="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
              {{ formatImportedAt(character.importedAt) }}
            </span>
            <span
              class="rounded-full border px-2.5 py-1"
              :class="character.warnings.length > 0 ? 'border-amber-400/20 bg-amber-400/10 text-amber-100' : 'border-white/10 bg-white/5'"
            >
              {{ formatWarningCount(character) }}
            </span>
          </div>

          <Button
            class="mt-4"
            variant="ghost"
            size="sm"
            :aria-label="t.characters.removeAria"
            @click="removeCharacter(character.id)"
          >
            {{ t.characters.remove }}
          </Button>
        </article>
      </div>

      <div
        v-else
        class="mt-4 rounded-[1.25rem] border border-dashed border-white/14 bg-neutral-950/52 px-4 py-8 text-center"
      >
        <p class="text-sm font-medium text-neutral-100">
          {{ t.characters.noActiveTitle }}
        </p>
        <p class="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-400">
          {{ t.characters.emptyRoster }}
        </p>
        <Button
          class="mt-5"
          variant="secondary"
          @click="openFilePicker"
        >
          {{ t.characters.importCard }}
        </Button>
      </div>
    </section>

    <Collapse
      v-if="selectedCharacter"
      :title="selectedCharacter.card.name"
      :description="t.characters.activeEyebrow"
      default-open
    >
      <div class="grid gap-4">
        <section class="rounded-[1.25rem] border border-white/10 bg-neutral-950/58 p-4">
          <h3 class="text-sm font-semibold text-neutral-100">
            {{ t.characters.summaryTitle }}
          </h3>
          <p class="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-neutral-300">
            {{ selectedSummary }}
          </p>
        </section>

        <section class="grid gap-4 md:grid-cols-2">
          <div class="rounded-[1.25rem] border border-white/10 bg-neutral-950/58 p-4">
            <h3 class="text-sm font-semibold text-neutral-100">
              {{ t.characters.firstMessage }}
            </h3>
            <p class="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-neutral-300">
              {{ selectedCharacter.card.firstMessage || t.characters.noGreeting }}
            </p>
          </div>

          <div class="rounded-[1.25rem] border border-white/10 bg-neutral-950/58 p-4">
            <h3 class="text-sm font-semibold text-neutral-100">
              {{ t.characters.sourceTitle }}
            </h3>
            <dl class="mt-3 grid gap-2 text-sm">
              <div class="min-w-0">
                <dt class="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
                  {{ t.characters.sourceFile }}
                </dt>
                <dd class="mt-1 break-words text-neutral-300">
                  {{ selectedCharacter.source.fileName }}
                </dd>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <dt class="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
                    {{ t.characters.sourceFormat }}
                  </dt>
                  <dd class="mt-1 text-neutral-300">
                    {{ selectedCharacter.source.format.toUpperCase() }}
                  </dd>
                </div>
                <div>
                  <dt class="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
                    {{ t.characters.sourceImported }}
                  </dt>
                  <dd class="mt-1 text-neutral-300">
                    {{ formatImportedAt(selectedCharacter.importedAt) }}
                  </dd>
                </div>
              </div>
            </dl>
          </div>
        </section>

        <Collapse
          :title="t.characters.advancedTitle"
          :description="t.characters.advancedDescription"
        >
          <div
            v-if="advancedFields(selectedCharacter).length > 0"
            class="grid gap-3"
          >
            <div
              v-for="field in advancedFields(selectedCharacter)"
              :key="field.label"
              class="rounded-2xl border border-white/8 bg-neutral-950/70 p-3"
            >
              <p class="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
                {{ field.label }}
              </p>
              <p class="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-neutral-300">
                {{ field.value }}
              </p>
            </div>
          </div>
          <p
            v-else
            class="text-sm leading-6 text-neutral-400"
          >
            {{ t.characters.noAdvancedFields }}
          </p>
        </Collapse>

        <Collapse
          v-if="selectedCharacter.warnings.length > 0"
          :title="t.characters.importWarnings"
          tone="warning"
          :description="formatWarningCount(selectedCharacter)"
        >
          <ul class="grid gap-2 text-sm leading-6 text-amber-100">
            <li
              v-for="warning in describeReasons(selectedCharacter.warnings)"
              :key="warning"
              class="rounded-2xl border border-amber-400/15 bg-amber-400/10 px-3 py-2"
            >
              {{ warning }}
            </li>
          </ul>
        </Collapse>
      </div>
    </Collapse>
  </section>
</template>
