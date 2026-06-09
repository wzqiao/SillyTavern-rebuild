<script setup lang="ts">
import { computed, ref } from 'vue';
import { Button, Collapse } from '@/ui-kit';
import { useCharacterStore } from '@/stores';
import { createCharacterImportInputFromFile } from '@/services/characterFileImportService';
import type {
  ReforgedCharacterCardPngParseReason,
  ReforgedCharacterImportResult,
  ReforgedCharacterRosterItem,
} from '@/contracts/character';

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
    return 'Import or select a character to make it available to chat.';
  }

  return character.card.description || character.card.scenario || character.card.firstMessage || 'No summary has been provided yet.';
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
    importNotice.value = `Import failed: ${describeError(error)}`;
    importNoticeTone.value = 'danger';
  } finally {
    importBusy.value = false;
    input.value = '';
  }
}

function handleImportResult(result: ReforgedCharacterImportResult): void {
  if (!result.ok) {
    importNotice.value = result.message;
    importNoticeTone.value = 'danger';
    return;
  }

  const warningCopy = result.warnings.length === 1 ? '1 warning' : `${result.warnings.length} warnings`;
  importNotice.value = result.warnings.length > 0
    ? `${result.card.name} imported with ${warningCopy}.`
    : `${result.card.name} imported and selected.`;
  importNoticeTone.value = 'success';
}

function selectCharacter(characterId: string): void {
  const selected = characterStore.selectCharacter(characterId);

  if (!selected) {
    importNotice.value = 'That character is no longer in the roster.';
    importNoticeTone.value = 'danger';
  }
}

function removeCharacter(characterId: string): void {
  const removed = characterStore.removeCharacter(characterId);

  if (removed) {
    importNotice.value = characterStore.selectedCharacter
      ? `Removed character. ${characterStore.selectedCharacter.card.name} is now selected.`
      : 'Removed character. Import another card to continue.';
    importNoticeTone.value = 'neutral';
  }
}

function clearCharacters(): void {
  characterStore.clearCharacters();
  importNotice.value = 'Character roster cleared.';
  importNoticeTone.value = 'neutral';
}

function characterInitial(character: ReforgedCharacterRosterItem): string {
  return character.card.name.trim().slice(0, 1).toUpperCase() || '?';
}

function characterDescription(character: ReforgedCharacterRosterItem): string {
  return character.card.description || character.card.scenario || character.card.firstMessage || 'No description yet.';
}

function formatImportedAt(value: string): string {
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

function formatSource(character: ReforgedCharacterRosterItem): string {
  return `${character.source.format.toUpperCase()} - ${character.source.fileName}`;
}

function formatWarningCount(character: ReforgedCharacterRosterItem): string {
  if (character.warnings.length === 0) {
    return 'No warnings';
  }

  return character.warnings.length === 1 ? '1 warning' : `${character.warnings.length} warnings`;
}

function advancedFields(character: ReforgedCharacterRosterItem): Array<{ label: string; value: string }> {
  return [
    { label: 'Personality', value: character.card.personality },
    { label: 'Scenario', value: character.card.scenario },
    { label: 'Tags', value: character.card.tags.join(', ') },
    { label: 'Alternate greetings', value: character.card.alternateGreetings.join('\n\n') },
    { label: 'Raw version', value: character.card.rawVersion },
    { label: 'Parser source', value: character.card.source },
    { label: 'Extensions', value: formatExtensions(character.card.extensions) },
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
  <section class="mx-auto grid w-full max-w-6xl gap-4 sm:gap-5">
    <header class="grid gap-4 rounded-[1.75rem] border border-white/10 bg-neutral-900/92 px-4 py-5 shadow-[0_24px_120px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <div class="min-w-0">
        <p class="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-cyan-200/75">
          Characters
        </p>
        <h1 class="mt-2 text-2xl font-semibold tracking-normal text-neutral-50 sm:text-3xl">
          Import and choose the active character
        </h1>
        <p class="mt-3 max-w-3xl text-sm leading-6 text-neutral-400">
          Bring in SillyTavern V2/V3 JSON or PNG cards, inspect the roster, and keep one character selected for chat.
        </p>
      </div>

      <div class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
        <span class="rounded-2xl border border-white/10 bg-white/6 px-3 py-2 text-center text-xs font-medium text-neutral-300">
          {{ characterStore.characters.length }} imported
        </span>
        <span
          class="rounded-2xl border px-3 py-2 text-center text-xs font-medium"
          :class="selectedCharacter ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100' : 'border-amber-400/20 bg-amber-400/10 text-amber-100'"
        >
          {{ selectedCharacter ? 'Ready for chat' : 'No selection' }}
        </span>
      </div>
    </header>

    <div class="grid gap-4 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)]">
      <aside class="grid min-w-0 gap-4 self-start">
        <section class="rounded-[1.5rem] border border-white/10 bg-neutral-900/88 p-4 shadow-[0_18px_70px_rgba(0,0,0,0.32)] sm:p-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-cyan-200/75">
                Import
              </p>
              <h2 class="mt-1 text-lg font-semibold text-neutral-50">
                Add a character card
              </h2>
            </div>
            <span class="rounded-full border border-white/10 bg-white/6 px-2.5 py-1 text-[0.68rem] font-medium text-neutral-300">
              JSON / PNG
            </span>
          </div>

          <input
            ref="fileInput"
            class="sr-only"
            data-testid="character-file-input"
            type="file"
            accept=".json,.png,application/json,image/png"
            @change="importCardFromFile"
          >

          <button
            type="button"
            class="mt-4 flex min-h-40 w-full flex-col items-center justify-center gap-3 rounded-[1.25rem] border border-dashed border-white/16 bg-neutral-950/58 px-4 py-5 text-center transition hover:border-cyan-300/40 hover:bg-white/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 disabled:cursor-wait disabled:opacity-60"
            :disabled="importBusy"
            @click="openFilePicker"
          >
            <span
              class="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/12 text-2xl font-light text-cyan-100"
              aria-hidden="true"
            >
              +
            </span>
            <span class="text-sm font-semibold text-neutral-100">
              {{ importBusy ? 'Reading card...' : 'Choose JSON or PNG card' }}
            </span>
            <span class="max-w-xs text-xs leading-5 text-neutral-400">
              SillyTavern V2/V3 cards only. YAML, CHARX, and BYAF stay out of this first pass.
            </span>
          </button>

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
              {{ importNotice || (lastImportResult?.ok ? 'Import complete.' : lastImportResult?.message) }}
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
        </section>

        <section class="rounded-[1.5rem] border border-white/10 bg-neutral-900/88 p-4 shadow-[0_18px_70px_rgba(0,0,0,0.32)] sm:p-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-cyan-200/75">
                Roster
              </p>
              <h2 class="mt-1 text-lg font-semibold text-neutral-50">
                Imported cards
              </h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              :disabled="!hasCharacters"
              @click="clearCharacters"
            >
              Clear
            </Button>
          </div>

          <div
            v-if="hasCharacters"
            class="mt-4 grid gap-3"
          >
            <article
              v-for="character in characterStore.characters"
              :key="character.id"
              class="min-w-0 rounded-[1.15rem] border bg-neutral-950/58 p-3 transition"
              :class="character.id === selectedCharacter?.id ? 'border-cyan-300/45 shadow-[0_0_0_1px_rgba(103,232,249,0.14)]' : 'border-white/10'"
            >
              <div class="flex min-w-0 gap-3">
                <button
                  type="button"
                  class="flex min-w-0 flex-1 gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
                  @click="selectCharacter(character.id)"
                >
                  <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/8 text-base font-semibold text-cyan-100">
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
                        Selected
                      </span>
                    </span>
                    <span class="mt-1 line-clamp-2 text-xs leading-5 text-neutral-400">
                      {{ characterDescription(character) }}
                    </span>
                  </span>
                </button>

                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Remove character"
                  @click="removeCharacter(character.id)"
                >
                  Remove
                </Button>
              </div>

              <div class="mt-3 flex flex-wrap gap-2 text-[0.68rem] font-medium text-neutral-400">
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
            </article>
          </div>

          <div
            v-else
            class="mt-4 rounded-[1.15rem] border border-dashed border-white/14 bg-neutral-950/52 px-4 py-5 text-sm leading-6 text-neutral-400"
          >
            No characters yet. Import a SillyTavern V2/V3 JSON or PNG card to build the roster.
          </div>
        </section>
      </aside>

      <main class="min-w-0 rounded-[1.5rem] border border-white/10 bg-neutral-900/88 p-4 shadow-[0_18px_70px_rgba(0,0,0,0.32)] sm:p-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-cyan-200/75">
              Active card
            </p>
            <h2 class="mt-1 break-words text-xl font-semibold text-neutral-50 sm:text-2xl">
              {{ selectedCharacter?.card.name || 'No character selected' }}
            </h2>
          </div>
          <span
            v-if="selectedCharacter"
            class="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-100"
          >
            Selected
          </span>
        </div>

        <div
          v-if="selectedCharacter"
          class="mt-5 grid gap-4"
        >
          <section class="rounded-[1.25rem] border border-white/10 bg-neutral-950/58 p-4">
            <h3 class="text-sm font-semibold text-neutral-100">
              Summary
            </h3>
            <p class="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-neutral-300">
              {{ selectedSummary }}
            </p>
          </section>

          <section class="grid gap-4 md:grid-cols-2">
            <div class="rounded-[1.25rem] border border-white/10 bg-neutral-950/58 p-4">
              <h3 class="text-sm font-semibold text-neutral-100">
                First message
              </h3>
              <p class="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-neutral-300">
                {{ selectedCharacter.card.firstMessage || 'No greeting provided.' }}
              </p>
            </div>

            <div class="rounded-[1.25rem] border border-white/10 bg-neutral-950/58 p-4">
              <h3 class="text-sm font-semibold text-neutral-100">
                Source
              </h3>
              <dl class="mt-3 grid gap-2 text-sm">
                <div class="min-w-0">
                  <dt class="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
                    File
                  </dt>
                  <dd class="mt-1 break-words text-neutral-300">
                    {{ selectedCharacter.source.fileName }}
                  </dd>
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <dt class="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
                      Format
                    </dt>
                    <dd class="mt-1 text-neutral-300">
                      {{ selectedCharacter.source.format.toUpperCase() }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
                      Imported
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
            title="Advanced character fields"
            description="Personality, scenario, alternate greetings, and parser metadata."
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
              This card does not include additional advanced fields.
            </p>
          </Collapse>

          <Collapse
            v-if="selectedCharacter.warnings.length > 0"
            title="Import warnings"
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

        <div
          v-else
          class="mt-5 rounded-[1.25rem] border border-dashed border-white/14 bg-neutral-950/52 px-4 py-8 text-center"
        >
          <p class="text-sm font-medium text-neutral-100">
            No active character
          </p>
          <p class="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-400">
            Import a JSON or PNG character card, then select it from the roster. The selected card is the one chat can read.
          </p>
          <Button
            class="mt-5"
            variant="secondary"
            @click="openFilePicker"
          >
            Import card
          </Button>
        </div>
      </main>
    </div>
  </section>
</template>
