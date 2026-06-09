<script setup lang="ts">
import type { ReforgedUiTone } from '@/contracts/ui';
import { resolveSwitchShellClasses, resolveSwitchThumbClasses, resolveSwitchTrackClasses } from './switch';

const props = withDefaults(defineProps<{
    modelValue: boolean;
    label?: string;
    description?: string;
    disabled?: boolean;
    tone?: ReforgedUiTone;
}>(), {
    label: undefined,
    description: undefined,
    disabled: false,
    tone: 'brand',
});

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    change: [value: boolean];
}>();

function toggle(): void {
    if (props.disabled) {
        return;
    }

    const nextValue = !props.modelValue;
    emit('update:modelValue', nextValue);
    emit('change', nextValue);
}
</script>

<template>
    <div :class="resolveSwitchShellClasses(tone, disabled)">
        <div class="space-y-1 pr-2">
            <p
                v-if="label"
                class="text-sm font-medium tracking-[-0.01em] text-neutral-100"
            >
                {{ label }}
            </p>
            <p
                v-if="description"
                class="text-sm leading-6 text-neutral-400"
            >
                {{ description }}
            </p>
            <slot />
        </div>

        <button
            type="button"
            role="switch"
            :aria-checked="modelValue"
            :disabled="disabled"
            :data-checked="modelValue"
            :class="resolveSwitchTrackClasses(tone, disabled)"
            @click="toggle"
        >
            <span
                :class="resolveSwitchThumbClasses(modelValue)"
                aria-hidden="true"
            />
        </button>
    </div>
</template>
