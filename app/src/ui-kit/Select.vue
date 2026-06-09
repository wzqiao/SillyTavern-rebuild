<script setup lang="ts">
import { computed, useAttrs } from 'vue';
import type { ReforgedSelectOption } from '@/contracts/ui';
import FieldShell from './FieldShell.vue';
import type { FieldTone } from './field';
import { resolveFieldClasses } from './field';
import { createUiId } from './utils';

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<{
    modelValue: string;
    options: readonly ReforgedSelectOption[];
    label?: string;
    hint?: string;
    error?: string;
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
    allowEmpty?: boolean;
    tone?: FieldTone;
    invalid?: boolean;
    inputId?: string;
    name?: string;
}>(), {
    label: undefined,
    hint: undefined,
    error: undefined,
    placeholder: 'Choose an option',
    disabled: false,
    required: false,
    allowEmpty: false,
    tone: 'neutral',
    invalid: false,
    inputId: undefined,
    name: undefined,
});

const emit = defineEmits<{
    'update:modelValue': [value: string];
    change: [value: string, event: Event];
    blur: [event: FocusEvent];
    focus: [event: FocusEvent];
}>();

const attrs = useAttrs();
const inputId = props.inputId ?? createUiId('select');
const resolvedTone = computed<FieldTone>(() => props.invalid || props.error ? 'danger' : props.tone);

function handleChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    emit('update:modelValue', target.value);
    emit('change', target.value, event);
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
                <select
                    v-bind="attrs"
                    :id="inputId"
                    :name="name"
                    :value="modelValue"
                    :disabled="disabled"
                    :required="required"
                    :aria-invalid="resolvedTone === 'danger' || undefined"
                    :aria-describedby="describedBy"
                    :class="[
                        resolveFieldClasses({
                            tone: resolvedTone,
                            disabled,
                            hasTrailing: true,
                        }),
                        'appearance-none pr-11',
                    ]"
                    @change="handleChange"
                    @blur="emit('blur', $event)"
                    @focus="emit('focus', $event)"
                >
                    <option
                        value=""
                        :disabled="!allowEmpty"
                    >
                        {{ placeholder }}
                    </option>
                    <option
                        v-for="option in options"
                        :key="option.value"
                        :value="option.value"
                        :disabled="option.disabled"
                    >
                        {{ option.label }}
                    </option>
                </select>

                <span
                    class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 text-neutral-400"
                    aria-hidden="true"
                >
                    <svg
                        viewBox="0 0 20 20"
                        class="h-4 w-4"
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
                </span>
            </div>
        </template>
    </FieldShell>
</template>
