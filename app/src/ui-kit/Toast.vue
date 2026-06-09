<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue';
import type { ReforgedToastItem } from '@/contracts/ui';
import {
    resolveToastActionClasses,
    resolveToastClasses,
    resolveToastDuration,
    resolveToastStackClasses,
    type ToastAlign,
    type ToastPosition,
} from './toast';

const props = withDefaults(defineProps<{
    items: readonly ReforgedToastItem[];
    position?: ToastPosition;
    align?: ToastAlign;
    defaultDurationMs?: number;
    autoDismiss?: boolean;
    dismissible?: boolean;
}>(), {
    position: 'top',
    align: 'center',
    defaultDurationMs: 4200,
    autoDismiss: true,
    dismissible: true,
});

const emit = defineEmits<{
    dismiss: [id: string, reason: 'timeout' | 'button'];
    action: [id: string];
}>();

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const itemSignature = computed(() => props.items.map((item) => `${item.id}:${item.durationMs ?? props.defaultDurationMs}`).join('|'));

function clearTimer(id: string): void {
    const timer = timers.get(id);

    if (timer) {
        clearTimeout(timer);
        timers.delete(id);
    }
}

function scheduleTimers(): void {
    const activeIds = new Set(props.items.map((item) => item.id));

    for (const id of timers.keys()) {
        if (!activeIds.has(id)) {
            clearTimer(id);
        }
    }

    if (!props.autoDismiss) {
        return;
    }

    for (const item of props.items) {
        if (timers.has(item.id)) {
            continue;
        }

        const duration = resolveToastDuration(item, props.defaultDurationMs);

        if (duration <= 0) {
            continue;
        }

        timers.set(item.id, setTimeout(() => {
            clearTimer(item.id);
            emit('dismiss', item.id, 'timeout');
        }, duration));
    }
}

function dismiss(id: string): void {
    clearTimer(id);
    emit('dismiss', id, 'button');
}

function triggerAction(id: string): void {
    emit('action', id);
}

watch(() => itemSignature.value, () => {
    scheduleTimers();
}, { immediate: true });

watch(() => props.autoDismiss, (autoDismiss) => {
    if (!autoDismiss) {
        for (const id of [...timers.keys()]) {
            clearTimer(id);
        }
        return;
    }

    scheduleTimers();
}, { immediate: true });

onBeforeUnmount(() => {
    for (const id of [...timers.keys()]) {
        clearTimer(id);
    }
});
</script>

<template>
    <section :class="resolveToastStackClasses(position, align)">
        <article
            v-for="item in items"
            :key="item.id"
            :class="resolveToastClasses(item.tone)"
        >
            <div class="flex items-start gap-3">
                <div class="min-w-0 flex-1 space-y-1">
                    <h3 class="text-sm font-medium tracking-[-0.01em]">
                        {{ item.title }}
                    </h3>
                    <p
                        v-if="item.description"
                        class="text-sm leading-6 text-current/78"
                    >
                        {{ item.description }}
                    </p>

                    <button
                        v-if="item.actionLabel"
                        type="button"
                        :class="resolveToastActionClasses()"
                        @click="triggerAction(item.id)"
                    >
                        {{ item.actionLabel }}
                    </button>
                </div>

                <button
                    v-if="dismissible"
                    type="button"
                    class="inline-flex min-h-9 min-w-9 items-center justify-center rounded-xl text-current/72 transition duration-200 ease-out hover:bg-white/8 hover:text-current"
                    @click="dismiss(item.id)"
                >
                    <span class="sr-only">Dismiss toast</span>
                    <svg
                        viewBox="0 0 20 20"
                        class="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.8"
                    >
                        <path
                            d="M6 6L14 14M14 6L6 14"
                            stroke-linecap="round"
                        />
                    </svg>
                </button>
            </div>
        </article>
    </section>
</template>
