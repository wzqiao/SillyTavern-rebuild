<script setup lang="ts">
import { computed } from 'vue';
import type { ReforgedListItemMeta, ReforgedUiTone } from '@/contracts/ui';
import { resolveListItemClasses, resolveListItemMetaClasses } from './listItem';

const props = withDefaults(defineProps<{
    title: string;
    subtitle?: string;
    description?: string;
    eyebrow?: string;
    meta?: readonly ReforgedListItemMeta[];
    interactive?: boolean;
    selected?: boolean;
    disabled?: boolean;
    tone?: ReforgedUiTone;
}>(), {
    subtitle: undefined,
    description: undefined,
    eyebrow: undefined,
    meta: () => [],
    interactive: false,
    selected: false,
    disabled: false,
    tone: 'neutral',
});

const emit = defineEmits<{
    press: [event: MouseEvent];
}>();

const rootTag = computed(() => props.interactive ? 'button' : 'div');

function handlePress(event: MouseEvent): void {
    if (!props.interactive || props.disabled) {
        if (props.disabled) {
            event.preventDefault();
        }
        return;
    }

    emit('press', event);
}
</script>

<template>
    <component
        :is="rootTag"
        :type="interactive ? 'button' : undefined"
        :disabled="interactive ? disabled : undefined"
        :class="resolveListItemClasses({
            interactive,
            selected,
            disabled,
            tone,
        })"
        @click="handlePress"
    >
        <div
            v-if="$slots.leading"
            class="shrink-0 pt-0.5"
        >
            <slot name="leading" />
        </div>

        <div class="min-w-0 flex-1 space-y-2">
            <div class="space-y-1">
                <p
                    v-if="eyebrow"
                    class="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-cyan-200/78"
                >
                    {{ eyebrow }}
                </p>

                <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h3 class="text-sm font-medium tracking-[-0.01em] text-neutral-100">
                        {{ title }}
                    </h3>
                    <p
                        v-if="subtitle"
                        class="text-sm text-neutral-400"
                    >
                        {{ subtitle }}
                    </p>
                </div>
            </div>

            <p
                v-if="description"
                class="text-sm leading-6 text-neutral-400"
            >
                {{ description }}
            </p>

            <div
                v-if="meta.length > 0"
                class="flex flex-wrap gap-2"
            >
                <span
                    v-for="item in meta"
                    :key="`${item.label}-${item.value}`"
                    :class="resolveListItemMetaClasses(item.tone)"
                >
                    <span class="text-white/62">{{ item.label }}</span>
                    <span class="ml-1">{{ item.value }}</span>
                </span>
            </div>

            <slot />
        </div>

        <div
            v-if="$slots.trailing"
            class="shrink-0 pt-0.5"
        >
            <slot name="trailing" />
        </div>
    </component>
</template>
