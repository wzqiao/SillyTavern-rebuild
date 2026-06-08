<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useCharacterStore, useChatStore, useConnectionStore, useWorldbookStore } from '@/stores';
import { createCharacterImportInputFromFile, createChatLorebookContext } from '@/services';
import type { ReforgedCharacterImportResult, ReforgedCharacterRosterItem } from '@/contracts/character';
import type { ReforgedChatCharacterContext, ReforgedChatMessage } from '@/contracts/chat';
import type { ReforgedConnectionDraftStatus } from '@/contracts/connection';
import type {
  EngineAdapterDiagnostics,
  HeadlessEngineAdapter,
  HeadlessGenerationRequest,
} from '@/contracts/engine';
import type { ReforgedWorldbookImportResult, ReforgedWorldbookLibraryItem } from '@/contracts/worldbook';

type AdapterMode = 'demo' | 'runtime';

const characterStore = useCharacterStore();
const chatStore = useChatStore();
const connectionStore = useConnectionStore();
const worldbookStore = useWorldbookStore();

const adapterMode = ref<AdapterMode>('demo');
const draftMessage = ref('Plot a safe course through the debris field.');
const pastedCard = ref('');
const pastedFileName = ref('pasted-character.json');
const pastedWorldbook = ref('');
const pastedWorldbookFileName = ref('pasted-worldbook.json');
const editingMessageId = ref<string | null>(null);
const editingContent = ref('');
const importBusy = ref(false);
const importNotice = ref<string | null>(null);
const connectionNotice = ref<string | null>(null);
const connectionIssueMessages = ref<string[]>([]);
const connectionSubmitStatus = ref<ReforgedConnectionDraftStatus | null>(null);
const worldbookNotice = ref<string | null>(null);
const runtimeBusy = ref(false);
const runtimeNotice = ref<string | null>(null);
const runtimeDiagnostics = ref<EngineAdapterDiagnostics | null>(null);
const chatScroll = ref<HTMLElement | null>(null);

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
    await delay(240);
    return createDemoReply(request);
  },
  generateRawData: async () => ({ mode: 'demo' }),
  sendChatCompletion: async () => ({ mode: 'demo' }),
};

const selectedRoster = computed(() => characterStore.selectedCharacter);
const selectedWorldbook = computed(() => worldbookStore.selectedWorldbook);
const selectedLorebooks = computed(() => selectedWorldbook.value ? [createChatLorebookContext(selectedWorldbook.value)] : []);
const selectedLorebook = computed(() => selectedLorebooks.value[0] ?? null);
const selectedWorldbookPreview = computed(() => selectedLorebook.value?.entries.slice(0, 3) ?? []);
const selectedMessages = computed(() => chatStore.selectedMessages);
const activeSession = computed(() => chatStore.selectedSession);
const readiness = computed(() => chatStore.readiness);
const runtimeAdapterReady = computed(() => adapterMode.value === 'runtime' && runtimeDiagnostics.value?.ok === true && readiness.value.hasAdapter);
const lastImportResult = computed(() => characterStore.lastImportResult);
const adapterModeLabel = computed(() => adapterMode.value === 'demo' ? 'Demo adapter' : 'Runtime adapter');
const hasChatTarget = computed(() => Boolean(activeSession.value || selectedRoster.value));
const connectionHandoff = computed(() => connectionStore.runtimeHandoff({
  runtimeAdapterReady: runtimeAdapterReady.value,
}));
const connectionPanelStatus = computed(() => connectionSubmitStatus.value ?? connectionHandoff.value.status);
const canAttemptRuntime = computed(() => adapterMode.value !== 'runtime' || connectionHandoff.value.canAttempt);
const runtimeDiagnosticLines = computed(() => [
  ...(runtimeDiagnostics.value?.blockers ?? []),
  ...(runtimeDiagnostics.value?.warnings ?? []),
].slice(0, 3));
const adapterStatusText = computed(() => {
  if (adapterMode.value === 'runtime' && runtimeBusy.value) {
    return 'checking SillyTavern runtime...';
  }

  if (adapterMode.value === 'runtime' && runtimeDiagnostics.value && !runtimeDiagnostics.value.ok) {
    return runtimeDiagnostics.value.blockers[0] ?? 'runtime diagnostics did not pass';
  }

  if (!hasChatTarget.value) {
    return 'import or select a character to start';
  }

  if (adapterMode.value === 'demo') {
    return readiness.value.canSend ? 'ready' : readiness.value.reason?.message;
  }

  return readiness.value.canSend ? 'runtime ready' : runtimeNotice.value ?? readiness.value.reason?.message;
});
const canSend = computed(() => (
  Boolean(draftMessage.value.trim()) &&
  hasChatTarget.value &&
  readiness.value.canSend &&
  canAttemptRuntime.value &&
  !chatStore.isGenerating
));
const connectionStatusClasses = computed(() => {
  if (connectionPanelStatus.value === 'ready-to-attempt') {
    return 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100';
  }

  if (connectionPanelStatus.value === 'incomplete') {
    return 'border-red-300/25 bg-red-400/10 text-red-100';
  }

  return 'border-amber-300/20 bg-amber-300/10 text-amber-100';
});
const connectionPanelMessage = computed(() => {
  if (connectionNotice.value) {
    return connectionNotice.value;
  }

  return connectionHandoff.value.message;
});

chatStore.setEngineAdapter(demoAdapter);

watch(() => selectedMessages.value.length, async () => {
  await nextTick();
  chatScroll.value?.scrollTo({
    top: chatScroll.value.scrollHeight,
    behavior: 'smooth',
  });
});

watch(
  () => [connectionStore.draft.baseUrl, connectionStore.draft.model, connectionStore.draft.apiKey],
  () => {
    connectionNotice.value = null;
    connectionIssueMessages.value = [];
    connectionSubmitStatus.value = null;
  },
  { flush: 'sync' },
);

function selectDemoAdapter(): void {
  adapterMode.value = 'demo';
  runtimeBusy.value = false;
  runtimeNotice.value = null;
  runtimeDiagnostics.value = null;
  chatStore.setEngineAdapter(demoAdapter);
}

function applyConnectionDraft(): void {
  const result = connectionStore.applyDraft(new Date().toISOString());
  connectionNotice.value = result.ok ? null : result.message;
  connectionIssueMessages.value = result.ok ? [] : result.issues.map((issue) => issue.message);
  connectionSubmitStatus.value = result.ok ? null : 'incomplete';
}

function clearConnectionDraft(): void {
  connectionStore.clearAll();
  connectionNotice.value = 'Connection draft cleared. Demo mode still works offline.';
  connectionIssueMessages.value = [];
  connectionSubmitStatus.value = null;
}

async function activateRuntimeAdapter(): Promise<void> {
  adapterMode.value = 'runtime';
  runtimeBusy.value = true;
  runtimeNotice.value = 'Checking same-origin SillyTavern runtime...';
  runtimeDiagnostics.value = null;
  chatStore.setEngineAdapter(null);
  const handoff = connectionStore.runtimeHandoff({ runtimeAdapterReady: false });
  if (handoff.status !== 'applied-but-unwired') {
    runtimeNotice.value = handoff.message;
    runtimeBusy.value = false;
    return;
  }

  runtimeNotice.value = 'Checking same-origin SillyTavern runtime...';

  try {
    const { loadHeadlessEngineAdapter } = await import('@/engine-adapter/runtimeAdapterLoader');
    const runtimeAdapter = await loadHeadlessEngineAdapter();
    const diagnostics = await runtimeAdapter.inspect();
    runtimeDiagnostics.value = diagnostics;

    if (!diagnostics.ok) {
      runtimeNotice.value = diagnostics.blockers[0] ?? 'Runtime adapter diagnostics did not pass.';
      return;
    }

    runtimeNotice.value = 'Runtime adapter ready.';
    chatStore.setEngineAdapter(runtimeAdapter);
  } catch (error) {
    runtimeNotice.value = `Runtime adapter failed to load: ${describeError(error)}`;
    chatStore.setEngineAdapter(null);
  } finally {
    runtimeBusy.value = false;
  }
}

function loadDemoCharacter(): void {
  const result = characterStore.importCharacter({
    fileName: 'astra-demo.json',
    text: JSON.stringify({
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: 'Astra',
        description: 'A navigator who reads star maps like sheet music.',
        personality: 'Calm, precise, quietly playful.',
        scenario: 'A damaged survey ship is drifting near a blue giant.',
        first_mes: 'Coordinates locked. Your move, captain.',
        tags: ['demo', 'space'],
      },
    }),
  }, new Date().toISOString());

  handleImportResult(result);
}

async function importCardFromFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    return;
  }

  importBusy.value = true;
  importNotice.value = null;

  try {
    const result = characterStore.importCharacter(
      await createCharacterImportInputFromFile(file),
      new Date().toISOString(),
    );

    handleImportResult(result);
  } catch (error) {
    importNotice.value = `Import failed: ${describeError(error)}`;
  } finally {
    importBusy.value = false;
    input.value = '';
  }
}

function importPastedCard(): void {
  if (!pastedCard.value.trim()) {
    importNotice.value = 'Paste a JSON character card first.';
    return;
  }

  const result = characterStore.importCharacter({
    fileName: pastedFileName.value.trim() || 'pasted-character.json',
    text: pastedCard.value,
  }, new Date().toISOString());

  handleImportResult(result);

  if (result.ok) {
    pastedCard.value = '';
  }
}

function handleImportResult(result: ReforgedCharacterImportResult): void {
  if (!result.ok) {
    importNotice.value = result.message;
    return;
  }

  const rosterItem = characterStore.selectedCharacter;
  if (rosterItem) {
    openCharacter(rosterItem);
  }

  importNotice.value = `${result.card.name} imported and opened.`;
}

function loadDemoWorldbook(): void {
  const result = worldbookStore.importWorldbook({
    fileName: 'astra-routes-worldbook.json',
    text: JSON.stringify({
      name: 'Astra Route Notes',
      entries: {
        0: {
          uid: 0,
          key: ['blue giant', 'debris field'],
          comment: 'Blue giant hazards',
          content: 'The blue giant throws off cheap sensors; Astra trusts triangulated star drift instead.',
          order: 120,
          position: 0,
        },
        1: {
          uid: 1,
          key: ['captain', 'course'],
          keysecondary: ['safe'],
          comment: 'Safe course protocol',
          content: 'A safe course means trading speed for silence: three burns, then coast dark.',
          selective: true,
          order: 90,
          position: 1,
        },
      },
    }),
  }, new Date().toISOString());

  handleWorldbookImportResult(result);
}

function importPastedWorldbook(): void {
  if (!pastedWorldbook.value.trim()) {
    worldbookNotice.value = 'Paste a SillyTavern world info JSON first.';
    return;
  }

  const result = worldbookStore.importWorldbook({
    fileName: pastedWorldbookFileName.value.trim() || 'pasted-worldbook.json',
    text: pastedWorldbook.value,
  }, new Date().toISOString());

  handleWorldbookImportResult(result);

  if (result.ok) {
    pastedWorldbook.value = '';
  }
}

function handleWorldbookImportResult(result: ReforgedWorldbookImportResult): void {
  if (!result.ok) {
    worldbookNotice.value = result.message;
    return;
  }

  worldbookNotice.value = `${result.worldbook.name} imported with ${result.worldbook.entries.length} entries.`;
}

function selectWorldbook(libraryItem: ReforgedWorldbookLibraryItem): void {
  if (worldbookStore.selectWorldbook(libraryItem.id)) {
    worldbookNotice.value = `${libraryItem.worldbook.name} selected.`;
  }
}

function openCharacter(rosterItem: ReforgedCharacterRosterItem): void {
  characterStore.selectCharacter(rosterItem.id);

  const existingSession = chatStore.sessions.find((session) => session.character?.id === rosterItem.id);
  if (existingSession) {
    chatStore.selectSession(existingSession.id);
    return;
  }

  chatStore.startSession({
    character: toChatCharacter(rosterItem),
  }, new Date().toISOString());
}

async function sendMessage(): Promise<void> {
  const content = draftMessage.value.trim();
  if (!content || !hasChatTarget.value || chatStore.isGenerating) {
    return;
  }

  const handoff = connectionHandoff.value;
  if (adapterMode.value === 'runtime' && !handoff.canAttempt) {
    runtimeNotice.value = handoff.message;
    return;
  }

  draftMessage.value = '';
  const result = await chatStore.sendUserMessage({
    content,
    character: selectedRoster.value ? toChatCharacter(selectedRoster.value) : activeSession.value?.character,
    lorebooks: selectedLorebooks.value,
    runtime: {
      mode: adapterMode.value === 'runtime' ? 'chat-completion' : 'generate-text',
      chatCompletionType: adapterMode.value === 'runtime' ? 'quiet' : undefined,
    },
    generation: {
      api: handoff.generation.api,
      responseLength: 220,
    },
  });

  if (!result.ok) {
    draftMessage.value = content;
  }
}

function beginEdit(message: ReforgedChatMessage): void {
  editingMessageId.value = message.id;
  editingContent.value = message.content;
}

function saveEdit(messageId: string): void {
  if (chatStore.editMessage(messageId, editingContent.value)) {
    editingMessageId.value = null;
    editingContent.value = '';
  }
}

function cancelEdit(): void {
  editingMessageId.value = null;
  editingContent.value = '';
}

function addLocalSwipe(message: ReforgedChatMessage): void {
  const activeCharacter = activeSession.value?.character?.name ?? 'the character';
  chatStore.appendAssistantSwipe(
    message.id,
    `Alternate take from ${activeCharacter}: the route is risky, but the story gets better if we take it slow.`,
  );
}

function messageBubbleClasses(message: ReforgedChatMessage): string[] {
  const isUser = message.role === 'user';
  return [
    'max-w-[88%] rounded-[1.5rem] px-4 py-3 text-sm leading-6 shadow-2xl shadow-black/20 transition-transform duration-200 ease-out',
    isUser
      ? 'ml-auto bg-amber-300 text-stone-950'
      : 'mr-auto border border-white/10 bg-white/10 text-stone-100 backdrop-blur',
    message.status === 'failed' ? 'ring-2 ring-red-400/70' : '',
  ];
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
  const messages = Array.isArray(request.prompt) ? request.prompt : [];
  const lastUser = [...messages].reverse().find((message) => message.role === 'user');
  const userText = typeof lastUser?.content === 'string' ? lastUser.content : 'the scene';
  const systemMessage = messages.find((message) => message.role === 'system');
  const systemText = typeof systemMessage?.content === 'string' ? systemMessage.content : '';
  const characterName = systemText.match(/roleplaying as ([^.]+)\./)?.[1] ?? 'the character';

  return `${characterName} studies the signal, then answers with a quiet grin: "${userText}" is exactly the kind of problem we can solve if we keep one hand on the map and one hand on the throttle.`;
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
  <main class="reforge-shell min-h-dvh overflow-hidden bg-[#07110f] text-stone-100">
    <section class="relative mx-auto flex min-h-dvh w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
      <header class="reveal flex flex-col gap-5 rounded-[2rem] border border-white/10 bg-white/[0.07] p-5 shadow-2xl shadow-black/30 backdrop-blur-2xl md:flex-row md:items-end md:justify-between">
        <div class="max-w-3xl">
          <p class="mb-3 inline-flex rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-100">
            M0 Signal Deck
          </p>
          <h1 class="text-balance text-4xl font-black tracking-[-0.08em] text-stone-50 sm:text-6xl">
            ST-Reforged
          </h1>
          <p class="mt-3 max-w-2xl text-sm leading-6 text-stone-300 sm:text-base">
            导入角色卡，选中角色，然后从新的 Vue/Pinia 外壳触发 headless 聊天状态流。默认 Demo adapter 可离线演示，Runtime adapter 会先诊断同源 SillyTavern 引擎再接入真实 chat-completion seam。
          </p>
        </div>

        <div class="grid grid-cols-2 gap-2 rounded-3xl bg-black/25 p-2 text-xs font-semibold">
          <button
            type="button"
            data-testid="demo-adapter-button"
            class="rounded-2xl px-4 py-3 transition duration-200 ease-out"
            :class="adapterMode === 'demo' ? 'bg-amber-300 text-stone-950 shadow-lg shadow-amber-500/20' : 'text-stone-300 hover:bg-white/10 hover:text-white'"
            @click="selectDemoAdapter"
          >
            Demo
          </button>
          <button
            type="button"
            data-testid="runtime-adapter-button"
            class="rounded-2xl px-4 py-3 transition duration-200 ease-out"
            :class="adapterMode === 'runtime' ? 'bg-emerald-300 text-stone-950 shadow-lg shadow-emerald-500/20' : 'text-stone-300 hover:bg-white/10 hover:text-white'"
            :disabled="runtimeBusy"
            @click="activateRuntimeAdapter"
          >
            {{ runtimeBusy ? 'Checking...' : 'Runtime' }}
          </button>
        </div>
      </header>

      <div class="grid min-h-0 flex-1 gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        <aside class="reveal reveal-delay-1 flex min-h-0 flex-col gap-5 overflow-y-auto pr-1 lg:max-h-[calc(100dvh-13rem)]">
          <section class="panel-card">
            <div class="mb-4 flex items-center justify-between gap-3">
              <div>
                <p class="eyebrow">API Draft</p>
                <h2 class="section-title">连接配置</h2>
              </div>
              <span
                class="rounded-full border px-3 py-1 text-xs font-bold"
                :class="connectionStatusClasses"
              >
                {{ connectionPanelStatus }}
              </span>
            </div>

            <div class="space-y-2">
              <input
                v-model="connectionStore.draft.baseUrl"
                class="field-input"
                data-testid="connection-base-url-input"
                inputmode="url"
                placeholder="https://api.example.com/v1"
              >
              <input
                v-model="connectionStore.draft.model"
                class="field-input"
                data-testid="connection-model-input"
                placeholder="gpt-4.1-compatible"
              >
              <input
                v-model="connectionStore.draft.apiKey"
                class="field-input"
                data-testid="connection-api-key-input"
                type="password"
                autocomplete="off"
                placeholder="API key, kept in memory only"
              >
            </div>

            <div class="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                class="primary-button flex-1"
                data-testid="connection-apply-button"
                @click="applyConnectionDraft"
              >
                Apply draft
              </button>
              <button
                type="button"
                class="soft-button"
                @click="clearConnectionDraft"
              >
                Clear
              </button>
            </div>

            <div
              class="mt-4 rounded-2xl border px-4 py-3 text-xs leading-5"
              :class="connectionStatusClasses"
            >
              <p class="font-bold">
                {{ connectionPanelMessage }}
              </p>
              <p v-if="connectionStore.appliedDraft" class="mt-1 text-stone-300">
                {{ connectionStore.appliedDraft.model }} · {{ connectionStore.appliedDraft.baseUrl }} · {{ connectionStore.maskedApiKey }}
              </p>
              <ul v-if="connectionIssueMessages.length" class="mt-2 space-y-1">
                <li v-for="issue in connectionIssueMessages" :key="issue">
                  {{ issue }}
                </li>
              </ul>
              <p class="mt-2 text-stone-400">
                未验证、不持久化、刷新后清空；真实连通性仍由 Runtime adapter 与同源 SillyTavern 设置验证。
              </p>
            </div>
          </section>

          <section class="panel-card">
            <div class="mb-4 flex items-center justify-between gap-3">
              <div>
                <p class="eyebrow">Character Intake</p>
                <h2 class="section-title">角色导入</h2>
              </div>
              <button
                type="button"
                class="soft-button"
                data-testid="demo-character-button"
                @click="loadDemoCharacter"
              >
                Demo card
              </button>
            </div>

            <label class="file-drop">
              <input
                class="sr-only"
                data-testid="character-file-input"
                type="file"
                accept=".json,.png,application/json,image/png"
                @change="importCardFromFile"
              >
              <span class="text-3xl">+</span>
              <span class="text-sm font-semibold">选择 JSON / PNG 角色卡</span>
              <span class="text-xs text-stone-400">{{ importBusy ? 'Reading card...' : 'V2/V3 card parser, no legacy DOM' }}</span>
            </label>

            <div class="mt-4 space-y-2">
              <input
                v-model="pastedFileName"
                class="field-input"
                placeholder="pasted-character.json"
              >
              <textarea
                v-model="pastedCard"
                class="field-input min-h-28 resize-none"
                placeholder='Paste character JSON here, then tap "Import paste".'
              />
              <button type="button" class="primary-button w-full" @click="importPastedCard">
                Import paste
              </button>
            </div>

            <p v-if="importNotice" class="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-5 text-stone-300">
              {{ importNotice }}
            </p>
            <p v-else-if="lastImportResult && !lastImportResult.ok" class="mt-4 rounded-2xl border border-red-300/30 bg-red-400/10 px-4 py-3 text-xs text-red-100">
              {{ lastImportResult.message }}
            </p>
          </section>

          <section class="panel-card min-h-0">
            <div class="mb-4 flex items-center justify-between">
              <div>
                <p class="eyebrow">Roster</p>
                <h2 class="section-title">已导入角色</h2>
              </div>
              <span class="rounded-full bg-white/10 px-3 py-1 text-xs text-stone-300">
                {{ characterStore.characters.length }}
              </span>
            </div>

            <div v-if="characterStore.characters.length" class="space-y-3">
              <button
                v-for="character in characterStore.characters"
                :key="character.id"
                type="button"
                class="roster-card"
                :class="character.id === selectedRoster?.id ? 'border-amber-300/60 bg-amber-300/10' : 'border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.07]'"
                @click="openCharacter(character)"
              >
                <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-200 to-emerald-200 text-base font-black text-stone-950">
                  {{ character.card.name.slice(0, 1).toUpperCase() }}
                </span>
                <span class="min-w-0 text-left">
                  <span class="block truncate text-sm font-bold text-stone-100">{{ character.card.name }}</span>
                  <span class="line-clamp-2 text-xs leading-5 text-stone-400">
                    {{ character.card.description || character.card.scenario || 'No description yet.' }}
                  </span>
                </span>
              </button>
            </div>

            <div v-else class="rounded-3xl border border-dashed border-white/15 p-5 text-sm leading-6 text-stone-400">
              还没有角色。先点 Demo card，或者导入一张 SillyTavern V2/V3 JSON/PNG 角色卡。
            </div>
          </section>

          <section class="panel-card min-h-0">
            <div class="mb-4 flex items-center justify-between gap-3">
              <div>
                <p class="eyebrow">Lorebook Library</p>
                <h2 class="section-title">世界书</h2>
              </div>
              <button type="button" class="soft-button" @click="loadDemoWorldbook">
                Demo lore
              </button>
            </div>

            <div class="space-y-2">
              <input
                v-model="pastedWorldbookFileName"
                class="field-input"
                placeholder="pasted-worldbook.json"
              >
              <textarea
                v-model="pastedWorldbook"
                class="field-input min-h-24 resize-none"
                data-testid="worldbook-paste-input"
                placeholder='Paste SillyTavern world info JSON, then tap "Import lorebook".'
              />
              <button
                type="button"
                class="primary-button w-full"
                data-testid="worldbook-import-button"
                @click="importPastedWorldbook"
              >
                Import lorebook
              </button>
            </div>

            <p v-if="worldbookNotice" class="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-5 text-stone-300">
              {{ worldbookNotice }}
            </p>

            <div class="mt-4 flex items-center justify-between">
              <p class="text-xs font-bold uppercase tracking-[0.2em] text-stone-500">
                {{ worldbookStore.worldbooks.length }} lorebooks
              </p>
              <p v-if="selectedLorebook" class="rounded-full bg-emerald-300/10 px-3 py-1 text-xs font-bold text-emerald-100">
                {{ selectedLorebook.entries.length }} entries active
              </p>
            </div>

            <div v-if="worldbookStore.worldbooks.length" class="mt-3 max-h-72 space-y-3 overflow-y-auto pr-1">
              <button
                v-for="worldbook in worldbookStore.worldbooks"
                :key="worldbook.id"
                type="button"
                class="roster-card"
                :class="worldbook.id === selectedWorldbook?.id ? 'border-emerald-300/60 bg-emerald-300/10' : 'border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.07]'"
                @click="selectWorldbook(worldbook)"
              >
                <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-200 to-sky-200 text-base font-black text-stone-950">
                  WI
                </span>
                <span class="min-w-0 text-left">
                  <span class="block truncate text-sm font-bold text-stone-100">{{ worldbook.worldbook.name }}</span>
                  <span class="line-clamp-2 text-xs leading-5 text-stone-400">
                    {{ worldbook.worldbook.source }} · {{ worldbook.worldbook.entries.length }} entries
                  </span>
                </span>
              </button>
            </div>

            <div v-else class="mt-3 rounded-3xl border border-dashed border-white/15 p-5 text-sm leading-6 text-stone-400">
              还没有世界书。先点 Demo lore，或者粘贴一个 SillyTavern world info JSON。
            </div>

            <div v-if="selectedWorldbookPreview.length" class="mt-4 rounded-3xl border border-emerald-300/15 bg-emerald-300/5 p-4">
              <p class="mb-3 text-xs font-black uppercase tracking-[0.2em] text-emerald-100">
                Active lore preview
              </p>
              <div class="space-y-3">
                <div
                  v-for="entry in selectedWorldbookPreview"
                  :key="entry.id"
                  class="rounded-2xl bg-black/20 px-3 py-2"
                >
                  <p class="truncate text-xs font-bold text-stone-100">
                    {{ entry.title || 'Untitled entry' }}
                  </p>
                  <p class="mt-1 line-clamp-2 text-xs leading-5 text-stone-400">
                    {{ entry.content || 'No prompt content yet.' }}
                  </p>
                </div>
              </div>
            </div>
          </section>
        </aside>

        <section class="reveal reveal-delay-2 panel-card flex min-h-[70dvh] flex-col p-0">
          <div class="flex flex-col gap-4 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0">
              <p class="eyebrow">Chat Bridge</p>
              <h2 class="truncate text-2xl font-black tracking-[-0.05em] text-stone-50">
                {{ activeSession?.character?.name || selectedRoster?.card.name || '选择角色后开始聊天' }}
              </h2>
              <p class="mt-1 text-xs text-stone-400">
                {{ adapterModeLabel }} · {{ adapterStatusText }}
              </p>
              <div
                v-if="adapterMode === 'runtime' && (runtimeNotice || runtimeDiagnosticLines.length)"
                class="mt-3 rounded-2xl border px-4 py-3 text-xs leading-5"
                :class="runtimeDiagnostics?.ok ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100' : 'border-amber-300/20 bg-amber-300/10 text-amber-100'"
              >
                <p class="font-bold">{{ runtimeNotice }}</p>
                <ul v-if="runtimeDiagnosticLines.length" class="mt-2 space-y-1">
                  <li v-for="line in runtimeDiagnosticLines" :key="line">
                    {{ line }}
                  </li>
                </ul>
              </div>
            </div>

            <div class="flex flex-wrap gap-2">
              <span class="status-pill" :class="canSend ? 'bg-emerald-300/15 text-emerald-100' : 'bg-amber-300/15 text-amber-100'">
                <span class="h-2 w-2 rounded-full" :class="canSend ? 'bg-emerald-300' : 'bg-amber-300'" />
                {{ canSend ? 'Ready to send' : 'Waiting' }}
              </span>
              <button
                v-if="chatStore.isGenerating"
                type="button"
                class="soft-button"
                @click="chatStore.cancelGeneration()"
              >
                Cancel
              </button>
            </div>
          </div>

          <div ref="chatScroll" class="chat-scroll flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
            <div v-if="!selectedMessages.length" class="empty-chat">
              <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-amber-300 text-3xl text-stone-950 shadow-xl shadow-amber-500/20">
                ST
              </div>
              <h3 class="text-xl font-black tracking-[-0.05em] text-stone-100">等待第一条消息</h3>
              <p class="mt-2 text-sm leading-6 text-stone-400">
                Demo card 会自动放入角色开场白。真实 runtime 模式需要 SillyTavern 同源运行时和 API 设置可用。
              </p>
            </div>

            <article
              v-for="message in selectedMessages"
              :key="message.id"
              class="message-row"
              :class="message.role === 'user' ? 'items-end' : 'items-start'"
            >
              <div :class="messageBubbleClasses(message)">
                <div class="mb-2 flex items-center justify-between gap-3 text-[0.65rem] font-black uppercase tracking-[0.2em] opacity-70">
                  <span>{{ message.role }}</span>
                  <span>{{ message.status }}</span>
                </div>

                <div v-if="editingMessageId === message.id" class="space-y-3">
                  <textarea v-model="editingContent" class="field-input min-h-24 resize-none bg-black/25" />
                  <div class="flex gap-2">
                    <button type="button" class="mini-button" @click="saveEdit(message.id)">Save</button>
                    <button type="button" class="mini-button subtle" @click="cancelEdit">Cancel</button>
                  </div>
                </div>
                <p v-else class="whitespace-pre-wrap">{{ message.content || 'Generating...' }}</p>

                <p v-if="message.error" class="mt-3 rounded-xl bg-red-500/15 px-3 py-2 text-xs text-red-100">
                  {{ message.error.message }}
                </p>

                <div class="mt-3 flex flex-wrap items-center gap-2">
                  <button type="button" class="mini-button subtle" @click="beginEdit(message)">Edit</button>
                  <button type="button" class="mini-button subtle" @click="chatStore.deleteMessage(message.id)">Delete</button>
                  <button
                    v-if="message.role === 'assistant'"
                    type="button"
                    class="mini-button subtle"
                    @click="addLocalSwipe(message)"
                  >
                    Add swipe
                  </button>
                </div>

                <div v-if="message.role === 'assistant' && message.alternatives.length > 1" class="mt-3 flex flex-wrap gap-1">
                  <button
                    v-for="(_alternative, index) in message.alternatives"
                    :key="index"
                    type="button"
                    class="h-7 min-w-7 rounded-full text-xs font-bold transition duration-200"
                    :class="message.activeAlternativeIndex === index ? 'bg-stone-100 text-stone-950' : 'bg-white/10 text-stone-300 hover:bg-white/20'"
                    @click="chatStore.selectAssistantSwipe(message.id, index)"
                  >
                    {{ index + 1 }}
                  </button>
                </div>
              </div>
            </article>
          </div>

          <form class="border-t border-white/10 p-4 sm:p-5" @submit.prevent="sendMessage">
            <div class="rounded-[1.7rem] border border-white/10 bg-black/25 p-2 shadow-inner shadow-black/20">
              <textarea
                v-model="draftMessage"
                data-testid="chat-composer"
                class="min-h-24 w-full resize-none rounded-[1.3rem] bg-transparent px-4 py-3 text-sm leading-6 text-stone-100 outline-none placeholder:text-stone-500"
                placeholder="Send a message to the selected character..."
              />
              <div class="flex flex-col gap-3 px-2 pb-2 sm:flex-row sm:items-center sm:justify-between">
                <p class="text-xs text-stone-500">
                  {{ hasChatTarget ? (activeSession ? activeSession.title : selectedRoster?.card.name) : 'Import or select a character first' }}
                </p>
                <button
                  type="submit"
                  data-testid="send-message-button"
                  class="primary-button disabled:cursor-not-allowed disabled:opacity-40"
                  :disabled="!canSend"
                >
                  {{ chatStore.isGenerating ? 'Generating...' : 'Send message' }}
                </button>
              </div>
            </div>
          </form>
        </section>
      </div>
    </section>
  </main>
</template>

<style scoped>
.reforge-shell {
  position: relative;
  isolation: isolate;
}

.reforge-shell::before,
.reforge-shell::after {
  position: absolute;
  z-index: -1;
  border-radius: 999px;
  content: '';
  opacity: 0.78;
  pointer-events: none;
}

.reforge-shell::before {
  top: -12rem;
  right: -10rem;
  width: 32rem;
  height: 32rem;
  background: radial-gradient(circle, rgba(251, 191, 36, 0.36), transparent 68%);
}

.reforge-shell::after {
  bottom: -14rem;
  left: -10rem;
  width: 34rem;
  height: 34rem;
  background: radial-gradient(circle, rgba(45, 212, 191, 0.28), transparent 70%);
}

.panel-card {
  border: 1px solid rgb(255 255 255 / 0.1);
  border-radius: 2rem;
  background: linear-gradient(145deg, rgb(255 255 255 / 0.095), rgb(255 255 255 / 0.035));
  padding: 1rem;
  box-shadow: 0 24px 80px rgb(0 0 0 / 0.28);
  backdrop-filter: blur(22px);
}

.eyebrow {
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgb(167 243 208 / 0.86);
}

.section-title {
  margin-top: 0.25rem;
  font-size: 1.35rem;
  font-weight: 950;
  letter-spacing: -0.055em;
  color: rgb(250 250 249);
}

.file-drop {
  display: flex;
  min-height: 9rem;
  cursor: pointer;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  border: 1px dashed rgb(251 191 36 / 0.38);
  border-radius: 1.6rem;
  background: rgb(251 191 36 / 0.08);
  color: rgb(254 243 199);
  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1), background-color 200ms ease, border-color 200ms ease;
}

.file-drop:hover {
  border-color: rgb(251 191 36 / 0.72);
  background: rgb(251 191 36 / 0.13);
  transform: translateY(-2px);
}

.field-input {
  width: 100%;
  border: 1px solid rgb(255 255 255 / 0.1);
  border-radius: 1.2rem;
  background: rgb(0 0 0 / 0.24);
  padding: 0.8rem 1rem;
  font-size: 0.875rem;
  line-height: 1.45;
  color: rgb(245 245 244);
  outline: none;
  transition: border-color 180ms ease, background-color 180ms ease;
}

.field-input:focus {
  border-color: rgb(251 191 36 / 0.58);
  background: rgb(0 0 0 / 0.34);
}

.primary-button,
.soft-button,
.mini-button {
  border-radius: 999px;
  font-weight: 850;
  transition: transform 140ms cubic-bezier(0.22, 1, 0.36, 1), background-color 180ms ease, color 180ms ease, opacity 180ms ease;
}

.primary-button {
  background: rgb(251 191 36);
  padding: 0.85rem 1.25rem;
  color: rgb(28 25 23);
  box-shadow: 0 16px 35px rgb(251 191 36 / 0.2);
}

.soft-button {
  background: rgb(255 255 255 / 0.1);
  padding: 0.65rem 0.95rem;
  color: rgb(245 245 244);
}

.mini-button {
  background: rgb(255 255 255 / 0.9);
  padding: 0.42rem 0.7rem;
  font-size: 0.72rem;
  color: rgb(28 25 23);
}

.mini-button.subtle {
  background: rgb(255 255 255 / 0.1);
  color: rgb(245 245 244);
}

.primary-button:not(:disabled):hover,
.soft-button:hover,
.mini-button:hover {
  transform: translateY(-1px);
}

.roster-card {
  display: flex;
  width: 100%;
  gap: 0.85rem;
  border-radius: 1.45rem;
  border-width: 1px;
  padding: 0.8rem;
  transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1), background-color 180ms ease, border-color 180ms ease;
}

.roster-card:hover {
  transform: translateY(-1px);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  border-radius: 999px;
  padding: 0.55rem 0.8rem;
  font-size: 0.75rem;
  font-weight: 800;
}

.chat-scroll {
  scrollbar-width: thin;
  scrollbar-color: rgb(255 255 255 / 0.22) transparent;
}

.empty-chat {
  margin: 4rem auto;
  max-width: 22rem;
  text-align: center;
}

.message-row {
  display: flex;
  flex-direction: column;
}

@media (prefers-reduced-motion: no-preference) {
  .reveal {
    animation: reveal-in 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .reveal-delay-1 {
    animation-delay: 80ms;
  }

  .reveal-delay-2 {
    animation-delay: 150ms;
  }
}

@keyframes reveal-in {
  from {
    opacity: 0;
    transform: translateY(16px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
