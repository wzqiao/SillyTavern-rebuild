<script setup lang="ts">
import { useAttrs } from 'vue';
import type { ReforgedUiTone } from '@/contracts/ui';
import type { SpinnerSize } from './spinner';
import { resolveSpinnerClasses } from './spinner';

defineOptions({ inheritAttrs: false });

withDefaults(defineProps<{
    size?: SpinnerSize;
    tone?: ReforgedUiTone;
    label?: string;
}>(), {
    size: 'md',
    tone: 'neutral',
    label: 'Loading',
});

const attrs = useAttrs();
</script>

<template>
    <span
        v-bind="attrs"
        class="inline-flex items-center justify-center"
        role="status"
        :aria-label="label"
    >
        <span
            :class="resolveSpinnerClasses(size, tone)"
            aria-hidden="true"
        />
        <span class="sr-only">{{ label }}</span>
    </span>
</template>
