<script setup lang="ts">
import { computed, useAttrs } from 'vue';
import FieldShell from './FieldShell.vue';
import type { FieldTone } from './field';
import { resolveFieldClasses } from './field';
import { createUiId } from './utils';

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<{
    modelValue: string;
    label?: string;
    hint?: string;
    error?: string;
    placeholder?: string;
    name?: string;
    disabled?: boolean;
    required?: boolean;
    rows?: number;
    tone?: FieldTone;
    invalid?: boolean;
    inputId?: string;
}>(), {
    label: undefined,
    hint: undefined,
    error: undefined,
    placeholder: undefined,
    name: undefined,
    disabled: false,
    required: false,
    rows: 5,
    tone: 'neutral',
    invalid: false,
    inputId: undefined,
});

const emit = defineEmits<{
    'update:modelValue': [value: string];
    blur: [event: FocusEvent];
    focus: [event: FocusEvent];
}>();

const attrs = useAttrs();
const inputId = props.inputId ?? createUiId('textarea');
const resolvedTone = computed<FieldTone>(() => props.invalid || props.error ? 'danger' : props.tone);

function handleInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    emit('update:modelValue', target.value);
}
</script>

<template>
    <FieldShell
        :input-id="inputId"
        :label="label"
        :hint="hint"
        :error="error"
        :required="required"
    >
        <template #default="{ describedBy }">
            <textarea
                v-bind="attrs"
                :id="inputId"
                :name="name"
                :value="modelValue"
                :rows="rows"
                :disabled="disabled"
                :required="required"
                :placeholder="placeholder"
                :aria-invalid="resolvedTone === 'danger' || undefined"
                :aria-describedby="describedBy"
                :class="resolveFieldClasses({
                    tone: resolvedTone,
                    disabled,
                    multiline: true,
                })"
                @input="handleInput"
                @blur="emit('blur', $event)"
                @focus="emit('focus', $event)"
            />
        </template>
    </FieldShell>
</template>
