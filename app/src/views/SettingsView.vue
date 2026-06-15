<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ReforgedSelectOption } from '@/contracts/ui';
import { type Locale, useI18n } from '@/i18n';
import { useConnectionStore, usePersonaStore } from '@/stores';
import { Button, Collapse, Input, ListItem, Select, Switch, Textarea } from '@/ui-kit';

type SettingsGroupId =
    | 'connection'
    | 'characters'
    | 'identity'
    | 'theme'
    | 'model'
    | 'worldbooks'
    | 'language'
    | 'about';

interface SettingsGroup {
    id: SettingsGroupId;
    title: string;
    description: string;
    value: string;
}

const { t, locale, setLocale } = useI18n();

const connectionStore = useConnectionStore();
const personaStore = usePersonaStore();
const secretsCleared = ref(false);

function clearLocalSecrets(): void {
    connectionStore.clearApiKey();
    secretsCleared.value = true;
}

const selectedGroupId = ref<SettingsGroupId>('language');
const density = ref('comfortable');
const compactMode = ref(false);
const showDiagnostics = ref(false);
const reduceMotion = ref(false);
const advancedOpen = ref(false);
const samplingPreset = ref('balanced');
const temperature = ref('0.80');
const topP = ref('0.95');
const contextReserve = ref('1200');

const densityOptions = computed<ReforgedSelectOption[]>(() => [
    { value: 'comfortable', label: t.value.settings.densityOptions.comfortable },
    { value: 'compact', label: t.value.settings.densityOptions.compact },
]);

const localeOptions = computed<ReforgedSelectOption[]>(() => [
    { value: 'zh', label: t.value.settings.languageOptions.zh },
    { value: 'en', label: t.value.settings.languageOptions.en },
]);

const samplingPresetOptions = computed<ReforgedSelectOption[]>(() => [
    { value: 'balanced', label: t.value.settings.samplingPresetOptions.balanced },
    { value: 'creative', label: t.value.settings.samplingPresetOptions.creative },
    { value: 'precise', label: t.value.settings.samplingPresetOptions.precise },
]);

const localPreviewCount = computed(() => [
    compactMode.value,
    showDiagnostics.value,
    reduceMotion.value,
    density.value !== 'comfortable',
].filter(Boolean).length);

const currentLanguageLabel = computed(() => (
    locale.value === 'zh'
        ? t.value.settings.languageOptions.zh
        : t.value.settings.languageOptions.en
));

const samplingPresetLabel = computed(() => (
    samplingPresetOptions.value.find((option) => option.value === samplingPreset.value)?.label
        ?? t.value.settings.samplingPresetOptions.balanced
));

const settingsGroups = computed<SettingsGroup[]>(() => [
    {
        id: 'connection',
        title: t.value.settings.groups.connection.title,
        description: t.value.settings.groups.connection.description,
        value: t.value.settings.groups.connection.value,
    },
    {
        id: 'characters',
        title: t.value.settings.groups.characters.title,
        description: t.value.settings.groups.characters.description,
        value: t.value.settings.groups.characters.value,
    },
    {
        id: 'identity',
        title: t.value.settings.groups.identity.title,
        description: t.value.settings.groups.identity.description,
        value: t.value.settings.groups.identity.value,
    },
    {
        id: 'theme',
        title: t.value.settings.groups.theme.title,
        description: t.value.settings.groups.theme.description,
        value: density.value === 'comfortable'
            ? t.value.settings.densityOptions.comfortable
            : t.value.settings.densityOptions.compact,
    },
    {
        id: 'model',
        title: t.value.settings.groups.model.title,
        description: t.value.settings.groups.model.description,
        value: samplingPresetLabel.value,
    },
    {
        id: 'worldbooks',
        title: t.value.settings.groups.worldbooks.title,
        description: t.value.settings.groups.worldbooks.description,
        value: t.value.settings.groups.worldbooks.value,
    },
    {
        id: 'language',
        title: t.value.settings.groups.language.title,
        description: t.value.settings.groups.language.description,
        value: currentLanguageLabel.value,
    },
    {
        id: 'about',
        title: t.value.settings.groups.about.title,
        description: t.value.settings.groups.about.description,
        value: t.value.settings.groups.about.value,
    },
]);

const selectedGroup = computed(() => (
    settingsGroups.value.find((group) => group.id === selectedGroupId.value) ?? settingsGroups.value[0]
));

function selectGroup(groupId: SettingsGroupId): void {
    selectedGroupId.value = groupId;
}

function updateLocale(value: string): void {
    if (value === 'zh' || value === 'en') {
        setLocale(value as Locale);
    }
}

function resetLocalPreview(): void {
    density.value = 'comfortable';
    compactMode.value = false;
    showDiagnostics.value = false;
    reduceMotion.value = false;
    advancedOpen.value = false;
    samplingPreset.value = 'balanced';
    temperature.value = '0.80';
    topP.value = '0.95';
    contextReserve.value = '1200';
}
</script>

<template>
    <section class="mx-auto grid w-full max-w-5xl gap-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <header class="rounded-[1.75rem] border border-white/10 bg-neutral-900/90 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.34)] backdrop-blur sm:p-6">
            <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div class="min-w-0">
                    <p class="text-xs font-semibold uppercase text-cyan-100/80">
                        {{ t.settings.headerEyebrow }}
                    </p>
                    <h1 class="mt-2 text-2xl font-bold text-white sm:text-3xl">
                        {{ t.settings.headerTitle }}
                    </h1>
                    <p class="mt-3 max-w-2xl text-sm leading-6 text-neutral-300">
                        {{ t.settings.headerDescription }}
                    </p>
                </div>

                <div class="flex shrink-0 items-center gap-2">
                    <span class="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold text-amber-100">
                        {{ t.settings.localPreview }}
                    </span>
                    <span class="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs font-semibold text-neutral-200">
                        {{ t.settings.changedCount(localPreviewCount) }}
                    </span>
                </div>
            </div>
        </header>

        <div class="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <nav
                class="grid min-w-0 gap-2 self-start rounded-[1.75rem] border border-white/10 bg-neutral-900/90 p-3 shadow-[0_18px_70px_rgba(0,0,0,0.28)]"
                :aria-label="t.settings.groupListLabel"
            >
                <ListItem
                    v-for="group in settingsGroups"
                    :key="group.id"
                    :title="group.title"
                    :description="group.description"
                    :subtitle="group.value"
                    :selected="group.id === selectedGroupId"
                    interactive
                    @press="selectGroup(group.id)"
                />
            </nav>

            <section class="grid min-w-0 gap-4 rounded-[1.75rem] border border-white/10 bg-neutral-900/90 p-4 shadow-[0_18px_70px_rgba(0,0,0,0.28)] sm:p-5">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div class="min-w-0">
                        <p class="text-xs font-semibold uppercase text-cyan-100/80">
                            {{ selectedGroup?.value }}
                        </p>
                        <h2 class="mt-2 font-display text-xl font-semibold text-white">
                            {{ selectedGroup?.title }}
                        </h2>
                        <p class="mt-2 text-sm leading-6 text-neutral-400">
                            {{ selectedGroup?.description }}
                        </p>
                    </div>
                    <span class="w-fit rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-semibold text-cyan-100">
                        {{ t.settings.notPersisted }}
                    </span>
                </div>

                <div
                    v-if="selectedGroupId === 'language'"
                    class="grid gap-4"
                >
                    <Select
                        :model-value="locale"
                        :options="localeOptions"
                        :label="t.settings.fields.language"
                        :hint="t.settings.fields.languageHint"
                        :placeholder="t.settings.fields.selectPlaceholder"
                        @update:model-value="updateLocale"
                    />
                </div>

                <div
                    v-else-if="selectedGroupId === 'theme'"
                    class="grid gap-4"
                >
                        <Select
                            v-model="density"
                            :options="densityOptions"
                            :label="t.settings.fields.density"
                            :hint="t.settings.fields.densityHint"
                            :placeholder="t.settings.fields.selectPlaceholder"
                        />

                        <Switch
                            v-model="compactMode"
                            :label="t.settings.fields.compactMode"
                            :description="t.settings.fields.compactModeDescription"
                        />

                        <Switch
                            v-model="showDiagnostics"
                            :label="t.settings.fields.showDiagnostics"
                            :description="t.settings.fields.showDiagnosticsDescription"
                            tone="warning"
                        />

                        <Switch
                            v-model="reduceMotion"
                            :label="t.settings.fields.reduceMotion"
                            :description="t.settings.fields.reduceMotionDescription"
                        />
                </div>

                <div
                    v-else-if="selectedGroupId === 'model'"
                    class="grid gap-4"
                >
                    <Select
                        v-model="samplingPreset"
                        :options="samplingPresetOptions"
                        :label="t.settings.fields.samplingPreset"
                        :hint="t.settings.fields.draftOnly"
                        :placeholder="t.settings.fields.selectPlaceholder"
                        disabled
                        tone="warning"
                    />

                    <Collapse
                        v-model="advancedOpen"
                        :title="t.settings.advancedTitle"
                        :description="t.settings.advancedDescription"
                        tone="warning"
                    >
                        <div class="grid gap-4">
                            <div class="rounded-[1.5rem] border border-amber-300/20 bg-amber-300/10 p-4">
                                <p class="text-sm font-semibold text-amber-100">
                                    {{ t.settings.notConnectedTitle }}
                                </p>
                                <p class="mt-2 text-sm leading-6 text-amber-50/80">
                                    {{ t.settings.notConnectedDescription }}
                                </p>
                            </div>

                            <div class="grid gap-4 sm:grid-cols-3">
                                <Input
                                    v-model="temperature"
                                    :label="t.settings.fields.temperature"
                                    :hint="t.settings.fields.placeholder"
                                    inputmode="decimal"
                                    disabled
                                    tone="warning"
                                />
                                <Input
                                    v-model="topP"
                                    :label="t.settings.fields.topP"
                                    :hint="t.settings.fields.placeholder"
                                    inputmode="decimal"
                                    disabled
                                    tone="warning"
                                />
                                <Input
                                    v-model="contextReserve"
                                    :label="t.settings.fields.contextReserve"
                                    :hint="t.settings.fields.placeholder"
                                    inputmode="numeric"
                                    disabled
                                    tone="warning"
                                />
                            </div>
                        </div>
                    </Collapse>
                </div>

                <div
                    v-else-if="selectedGroupId === 'identity'"
                    class="grid gap-4 rounded-[1.5rem] border border-white/10 bg-neutral-950/58 p-4"
                >
                    <Input
                        :model-value="personaStore.name"
                        :label="t.settings.identityFields.name"
                        :hint="t.settings.identityFields.nameHint"
                        autocomplete="nickname"
                        @update:model-value="personaStore.patchPersona({ name: $event })"
                    />
                    <Textarea
                        :model-value="personaStore.description"
                        :label="t.settings.identityFields.description"
                        :hint="t.settings.identityFields.descriptionHint"
                        :rows="4"
                        @update:model-value="personaStore.patchPersona({ description: $event })"
                    />
                </div>

                <div
                    v-else-if="selectedGroupId === 'about'"
                    class="rounded-[1.5rem] border border-white/10 bg-neutral-950/58 p-4 text-sm leading-6 text-neutral-300"
                >
                    {{ t.settings.aboutDescription }}
                </div>

                <div
                    v-else
                    class="rounded-[1.5rem] border border-white/10 bg-neutral-950/58 p-4"
                >
                    <p class="text-sm font-semibold text-neutral-100">
                        {{ t.settings.notConnectedTitle }}
                    </p>
                    <p class="mt-2 text-sm leading-6 text-neutral-400">
                        {{ t.settings.notConnectedDescription }}
                    </p>
                </div>

                <div class="grid gap-4 rounded-[1.5rem] border border-white/10 bg-neutral-950/58 p-4">
                    <h3 class="text-base font-semibold text-white">
                        {{ t.settings.statusTitle }}
                    </h3>
                    <dl class="grid gap-3 text-sm">
                        <div class="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/5 px-3 py-3">
                            <dt class="min-w-0 text-neutral-400">
                                {{ t.settings.secrets.label }}
                                <span class="mt-1 block text-xs leading-5 text-neutral-500">
                                    {{ t.settings.secrets.description }}
                                </span>
                            </dt>
                            <dd class="shrink-0">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    :disabled="secretsCleared"
                                    @click="clearLocalSecrets"
                                >
                                    {{ secretsCleared ? t.settings.secrets.cleared : t.settings.secrets.clear }}
                                </Button>
                            </dd>
                        </div>
                        <div class="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/5 px-3 py-3">
                            <dt class="text-neutral-400">
                                {{ t.settings.statusRows.advanced }}
                            </dt>
                            <dd class="font-semibold text-neutral-100">
                                {{ advancedOpen ? t.settings.statusRows.open : t.settings.statusRows.closed }}
                            </dd>
                        </div>
                        <div class="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/5 px-3 py-3">
                            <dt class="text-neutral-400">
                                {{ t.settings.statusRows.runtime }}
                            </dt>
                            <dd class="font-semibold text-amber-100">
                                {{ t.settings.statusRows.unchanged }}
                            </dd>
                        </div>
                    </dl>
                </div>

                <Button
                    variant="outline"
                    block
                    @click="resetLocalPreview"
                >
                    {{ t.settings.resetLocalPreview }}
                </Button>
            </section>
        </div>
    </section>
</template>
