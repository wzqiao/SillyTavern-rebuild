<script setup lang="ts">
import { computed } from 'vue';
import { fieldHintClass, fieldLabelClass, fieldShellClass } from './field';
import { createDescribedBy } from './utils';

const props = defineProps<{
    inputId: string;
    label?: string;
    hint?: string;
    error?: string;
    required?: boolean;
    hintId?: string;
}>();

const resolvedHintId = computed(() => props.hintId ?? `${props.inputId}-hint`);
const supportText = computed(() => props.error ?? props.hint);
const describedBy = computed(() => createDescribedBy(supportText.value ? resolvedHintId.value : undefined));
</script>

<template>
    <div :class="fieldShellClass">
        <label
            v-if="label"
            :for="inputId"
            :class="fieldLabelClass"
        >
            <span>{{ label }}</span>
            <span
                v-if="required"
                class="ml-1 text-cyan-200"
                aria-hidden="true"
            >
                *
            </span>
        </label>

        <slot :described-by="describedBy" />

        <p
            v-if="supportText"
            :id="resolvedHintId"
            :class="[
                fieldHintClass,
                error ? 'text-rose-200/88' : '',
            ]"
        >
            {{ supportText }}
        </p>
    </div>
</template>
