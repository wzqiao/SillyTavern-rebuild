<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ReforgedUiTone } from '@/contracts/ui';
import {
    resolveCollapseIconClasses,
    resolveCollapsePanelClasses,
    resolveCollapseRootClasses,
    resolveCollapseTriggerClasses,
} from './collapse';
import { createUiId } from './utils';

const props = withDefaults(defineProps<{
    modelValue?: boolean;
    defaultOpen?: boolean;
    title: string;
    description?: string;
    tone?: ReforgedUiTone;
    disabled?: boolean;
}>(), {
    modelValue: undefined,
    defaultOpen: false,
    description: undefined,
    tone: 'neutral',
    disabled: false,
});

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    toggle: [value: boolean];
}>();

const isControlled = computed(() => props.modelValue !== undefined);
const internalOpen = ref(Boolean(props.defaultOpen));
const panelId = createUiId('collapse-panel');

const isOpen = computed(() => isControlled.value ? Boolean(props.modelValue) : internalOpen.value);

watch(() => props.defaultOpen, (defaultOpen) => {
    if (!isControlled.value) {
        internalOpen.value = Boolean(defaultOpen);
    }
});

function toggle(): void {
    if (props.disabled) {
        return;
    }

    const nextValue = !isOpen.value;

    if (!isControlled.value) {
        internalOpen.value = nextValue;
    }

    emit('update:modelValue', nextValue);
    emit('toggle', nextValue);
}
</script>

<template>
    <section :class="resolveCollapseRootClasses(disabled)">
        <button
            type="button"
            :aria-expanded="isOpen"
            :aria-controls="panelId"
            :disabled="disabled"
            :class="resolveCollapseTriggerClasses(tone, isOpen, disabled)"
            @click="toggle"
        >
            <div class="min-w-0 flex-1 space-y-1">
                <h3 class="text-sm font-medium tracking-[-0.01em]">
                    {{ title }}
                </h3>
                <p
                    v-if="description"
                    class="text-sm leading-6 text-neutral-400"
                >
                    {{ description }}
                </p>
            </div>

            <div class="flex items-center gap-3">
                <slot name="actions" />
                <svg
                    viewBox="0 0 20 20"
                    :class="['h-4 w-4', resolveCollapseIconClasses(isOpen)]"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                >
                    <path
                        d="M5 7.5L10 12.5L15 7.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
            </div>
        </button>

        <div
            :id="panelId"
            :class="resolveCollapsePanelClasses(isOpen)"
        >
            <div class="min-h-0 overflow-hidden">
                <div class="border-t border-white/6 px-4 py-4">
                    <slot />
                </div>
            </div>
        </div>
    </section>
</template>
