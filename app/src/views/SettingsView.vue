<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ReforgedSelectOption } from '@/contracts/ui';
import { Button, Collapse, Input, Select, Switch } from '@/ui-kit';

const density = ref('comfortable');
const compactMode = ref(false);
const showDiagnostics = ref(false);
const reduceMotion = ref(false);
const advancedOpen = ref(false);
const samplingPreset = ref('balanced');
const temperature = ref('0.80');
const topP = ref('0.95');
const contextReserve = ref('1200');

const densityOptions: ReforgedSelectOption[] = [
    { value: 'comfortable', label: 'Comfortable' },
    { value: 'compact', label: 'Compact preview' },
];

const samplingPresetOptions: ReforgedSelectOption[] = [
    { value: 'balanced', label: 'Balanced draft' },
    { value: 'creative', label: 'Creative draft' },
    { value: 'precise', label: 'Precise draft' },
];

const localPreviewCount = computed(() => [
    compactMode.value,
    showDiagnostics.value,
    reduceMotion.value,
    density.value !== 'comfortable',
].filter(Boolean).length);

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
                        Preferences
                    </p>
                    <h1 class="mt-2 text-2xl font-bold text-white sm:text-3xl">
                        Settings
                    </h1>
                    <p class="mt-3 max-w-2xl text-sm leading-6 text-neutral-300">
                        Simple controls stay visible. Advanced generation placeholders stay folded until the engine settings contract lands.
                    </p>
                </div>

                <div class="flex shrink-0 items-center gap-2">
                    <span class="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold text-amber-100">
                        Local preview
                    </span>
                    <span class="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs font-semibold text-neutral-200">
                        {{ localPreviewCount }} changed
                    </span>
                </div>
            </div>
        </header>

        <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div class="grid gap-5">
                <section class="rounded-[1.75rem] border border-white/10 bg-neutral-900/90 p-4 shadow-[0_18px_70px_rgba(0,0,0,0.28)] sm:p-5">
                    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <h2 class="text-lg font-semibold text-white">
                                Simple
                            </h2>
                            <p class="mt-1 text-sm leading-6 text-neutral-400">
                                Local UI preferences for the first settings pass.
                            </p>
                        </div>
                        <span class="w-fit rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-semibold text-cyan-100">
                            Not persisted
                        </span>
                    </div>

                    <div class="mt-5 grid gap-4">
                        <Select
                            v-model="density"
                            :options="densityOptions"
                            label="Interface density"
                            hint="Applies to this page preview only."
                        />

                        <Switch
                            v-model="compactMode"
                            label="Compact mode"
                            description="Local preview for tighter page spacing."
                        />

                        <Switch
                            v-model="showDiagnostics"
                            label="Show diagnostics"
                            description="Local preview for surfacing adapter and prompt status later."
                            tone="warning"
                        />

                        <Switch
                            v-model="reduceMotion"
                            label="Reduce motion"
                            description="Local preview for future app-wide motion preferences."
                        />
                    </div>
                </section>

                <Collapse
                    v-model="advancedOpen"
                    title="Advanced"
                    description="Generation and prompt placeholders. These controls are not connected to the runtime."
                    tone="warning"
                >
                    <div class="grid gap-4">
                        <div class="rounded-[1.25rem] border border-amber-300/20 bg-amber-300/10 p-4">
                            <p class="text-sm font-semibold text-amber-100">
                                Not connected to engine
                            </p>
                            <p class="mt-2 text-sm leading-6 text-amber-50/80">
                                These values are reserved for the future settings contract and do not change chat, worldbook, or connection behavior.
                            </p>
                        </div>

                        <Select
                            v-model="samplingPreset"
                            :options="samplingPresetOptions"
                            label="Sampling preset"
                            hint="Draft-only placeholder."
                            disabled
                            tone="warning"
                        />

                        <div class="grid gap-4 sm:grid-cols-3">
                            <Input
                                v-model="temperature"
                                label="Temperature"
                                hint="Placeholder"
                                inputmode="decimal"
                                disabled
                                tone="warning"
                            />
                            <Input
                                v-model="topP"
                                label="Top P"
                                hint="Placeholder"
                                inputmode="decimal"
                                disabled
                                tone="warning"
                            />
                            <Input
                                v-model="contextReserve"
                                label="Context reserve"
                                hint="Placeholder"
                                inputmode="numeric"
                                disabled
                                tone="warning"
                            />
                        </div>
                    </div>
                </Collapse>
            </div>

            <aside class="grid gap-4 lg:content-start">
                <section class="rounded-[1.75rem] border border-white/10 bg-neutral-900/90 p-4 shadow-[0_18px_70px_rgba(0,0,0,0.24)]">
                    <h2 class="text-base font-semibold text-white">
                        Status
                    </h2>
                    <dl class="mt-4 grid gap-3 text-sm">
                        <div class="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/5 px-3 py-3">
                            <dt class="text-neutral-400">
                                Store
                            </dt>
                            <dd class="font-semibold text-amber-100">
                                Not added
                            </dd>
                        </div>
                        <div class="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/5 px-3 py-3">
                            <dt class="text-neutral-400">
                                Advanced
                            </dt>
                            <dd class="font-semibold text-neutral-100">
                                {{ advancedOpen ? 'Open' : 'Closed' }}
                            </dd>
                        </div>
                        <div class="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/5 px-3 py-3">
                            <dt class="text-neutral-400">
                                Runtime
                            </dt>
                            <dd class="font-semibold text-amber-100">
                                Unchanged
                            </dd>
                        </div>
                    </dl>
                </section>

                <Button
                    variant="outline"
                    block
                    @click="resetLocalPreview"
                >
                    Reset local preview
                </Button>
            </aside>
        </div>
    </section>
</template>
