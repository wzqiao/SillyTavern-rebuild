<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ReforgedTabItem } from '@/contracts/ui';
import type { TabsSize, TabsVariant } from './tabs';
import { getInitialTabId, resolveTabTriggerClasses, resolveTabsListClasses } from './tabs';

const props = withDefaults(defineProps<{
    items: readonly ReforgedTabItem[];
    modelValue?: string | null;
    defaultValue?: string | null;
    variant?: TabsVariant;
    size?: TabsSize;
    stretch?: boolean;
    ariaLabel?: string;
}>(), {
    modelValue: undefined,
    defaultValue: null,
    variant: 'pill',
    size: 'md',
    stretch: false,
    ariaLabel: 'Tabs',
});

const emit = defineEmits<{
    'update:modelValue': [value: string | null];
    change: [value: string | null];
}>();

const internalValue = ref<string | null>(getInitialTabId(props.items, props.defaultValue));
const isControlled = computed(() => props.modelValue !== undefined);
const activeId = computed(() => isControlled.value
    ? getInitialTabId(props.items, props.modelValue)
    : getInitialTabId(props.items, internalValue.value));
const activeItem = computed(() => props.items.find((item) => item.id === activeId.value) ?? null);

watch(() => props.items, (items) => {
    if (isControlled.value) {
        return;
    }

    internalValue.value = getInitialTabId(items, internalValue.value);
}, { deep: true });

function selectTab(item: ReforgedTabItem): void {
    if (item.disabled) {
        return;
    }

    if (!isControlled.value) {
        internalValue.value = item.id;
    }

    emit('update:modelValue', item.id);
    emit('change', item.id);
}
</script>

<template>
    <div class="space-y-4">
        <div
            role="tablist"
            :aria-label="ariaLabel"
            :class="resolveTabsListClasses(variant, stretch)"
        >
            <button
                v-for="item in items"
                :key="item.id"
                :id="`${item.id}-tab`"
                type="button"
                role="tab"
                :aria-selected="item.id === activeId"
                :aria-controls="`${item.id}-panel`"
                :tabindex="item.id === activeId ? 0 : -1"
                :disabled="item.disabled"
                :class="resolveTabTriggerClasses(item.id === activeId, variant, size, item.disabled)"
                @click="selectTab(item)"
            >
                <span>{{ item.label }}</span>
                <span
                    v-if="item.badge !== undefined"
                    class="rounded-full bg-black/18 px-2 py-0.5 text-[0.6875rem] text-current/88"
                >
                    {{ item.badge }}
                </span>
            </button>
        </div>

        <div
            v-if="$slots.default"
            :id="activeId ? `${activeId}-panel` : undefined"
            role="tabpanel"
            :aria-labelledby="activeId ? `${activeId}-tab` : undefined"
        >
            <slot
                :active-id="activeId"
                :active-item="activeItem"
            />
        </div>
    </div>
</template>
