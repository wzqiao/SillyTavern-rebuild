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
    type?: string;
    inputmode?: 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search';
    autocomplete?: string;
    name?: string;
    disabled?: boolean;
    required?: boolean;
    tone?: FieldTone;
    invalid?: boolean;
    inputId?: string;
}>(), {
    label: undefined,
    hint: undefined,
    error: undefined,
    placeholder: undefined,
    type: 'text',
    inputmode: undefined,
    autocomplete: undefined,
    name: undefined,
    disabled: false,
    required: false,
    tone: 'neutral',
    invalid: false,
    inputId: undefined,
});

const emit = defineEmits<{
    'update:modelValue': [value: string];
    blur: [event: FocusEvent];
    focus: [event: FocusEvent];
    enter: [event: KeyboardEvent];
}>();

const attrs = useAttrs();
const inputId = props.inputId ?? createUiId('input');
const resolvedTone = computed<FieldTone>(() => props.invalid || props.error ? 'danger' : props.tone);

function handleInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    emit('update:modelValue', target.value);
}

function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
        emit('enter', event);
    }
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
            <div class="relative">
                <div
                    v-if="$slots.leading"
                    class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400"
                >
                    <slot name="leading" />
                </div>

                <input
                    v-bind="attrs"
                    :id="inputId"
                    :name="name"
                    :type="type"
                    :value="modelValue"
                    :disabled="disabled"
                    :required="required"
                    :placeholder="placeholder"
                    :inputmode="inputmode"
                    :autocomplete="autocomplete"
                    :aria-invalid="resolvedTone === 'danger' || undefined"
                    :aria-describedby="describedBy"
                    :class="resolveFieldClasses({
                        tone: resolvedTone,
                        disabled,
                        hasLeading: Boolean($slots.leading),
                        hasTrailing: Boolean($slots.trailing),
                    })"
                    @input="handleInput"
                    @blur="emit('blur', $event)"
                    @focus="emit('focus', $event)"
                    @keydown="handleKeydown"
                />

                <div
                    v-if="$slots.trailing"
                    class="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400"
                >
                    <slot name="trailing" />
                </div>
            </div>
        </template>
    </FieldShell>
</template>
