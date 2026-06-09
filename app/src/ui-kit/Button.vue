<script setup lang="ts">
import { computed, useAttrs } from 'vue';
import type { ButtonSize, ButtonVariant } from './button';
import { resolveButtonClasses } from './button';

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<{
    variant?: ButtonVariant;
    size?: ButtonSize;
    type?: 'button' | 'submit' | 'reset';
    block?: boolean;
    loading?: boolean;
    disabled?: boolean;
    ariaLabel?: string;
}>(), {
    variant: 'primary',
    size: 'md',
    type: 'button',
    block: false,
    loading: false,
    disabled: false,
    ariaLabel: undefined,
});

const emit = defineEmits<{
    click: [event: MouseEvent];
}>();

const attrs = useAttrs();
const isDisabled = computed(() => props.disabled || props.loading);
const spinnerClass = computed(() => [
    'inline-block h-4 w-4 animate-spin rounded-full border-2 border-current/25 border-t-current',
    props.size === 'lg' ? 'h-5 w-5' : '',
]);

function handleClick(event: MouseEvent): void {
    if (isDisabled.value) {
        event.preventDefault();
        return;
    }

    emit('click', event);
}
</script>

<template>
    <button
        v-bind="attrs"
        :type="type"
        :disabled="isDisabled"
        :aria-busy="loading || undefined"
        :aria-label="ariaLabel"
        :class="resolveButtonClasses({
            variant,
            size,
            block,
            loading,
        })"
        @click="handleClick"
    >
        <span
            v-if="loading"
            :class="spinnerClass"
            aria-hidden="true"
        />
        <slot
            v-else-if="$slots.leading"
            name="leading"
        />

        <slot />

        <slot
            v-if="$slots.trailing"
            name="trailing"
        />
    </button>
</template>
