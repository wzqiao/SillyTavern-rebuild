<script setup lang="ts">
import { computed, onBeforeUnmount, useSlots, watch } from 'vue';
import type { ModalSize } from './overlay';
import { overlayBackdropClass, resolveModalPanelClasses } from './overlay';
import { acquireBodyScrollLock } from './overlayRuntime';
import { createUiId, isBrowserEnvironment } from './utils';

const props = withDefaults(defineProps<{
    open: boolean;
    title?: string;
    description?: string;
    size?: ModalSize;
    closeOnBackdrop?: boolean;
    closeOnEscape?: boolean;
    showClose?: boolean;
    padded?: boolean;
}>(), {
    title: undefined,
    description: undefined,
    size: 'md',
    closeOnBackdrop: true,
    closeOnEscape: true,
    showClose: true,
    padded: true,
});

const emit = defineEmits<{
    'update:open': [value: boolean];
    close: [reason: 'backdrop' | 'escape' | 'button'];
    open: [];
}>();

const slots = useSlots();
const titleId = createUiId('modal-title');
const descriptionId = createUiId('modal-description');
const canTeleport = isBrowserEnvironment();

let releaseScrollLock: (() => void) | null = null;

const panelPaddingClass = computed(() => props.padded ? 'px-4 pb-4 sm:px-5 sm:pb-5' : '');
const hasHeader = computed(() => Boolean(props.title || props.description || props.showClose || slots.header));

function removeEscapeListener(): void {
    if (isBrowserEnvironment()) {
        window.removeEventListener('keydown', handleEscapeKey);
    }
}

function requestClose(reason: 'backdrop' | 'escape' | 'button'): void {
    emit('update:open', false);
    emit('close', reason);
}

function handleEscapeKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !props.open || !props.closeOnEscape) {
        return;
    }

    event.preventDefault();
    requestClose('escape');
}

function handleBackdropClick(): void {
    if (props.closeOnBackdrop) {
        requestClose('backdrop');
    }
}

watch(() => props.open, (open, previousOpen) => {
    removeEscapeListener();
    releaseScrollLock?.();
    releaseScrollLock = null;

    if (!open) {
        return;
    }

    if (!previousOpen) {
        emit('open');
    }

    releaseScrollLock = acquireBodyScrollLock();

    if (props.closeOnEscape && isBrowserEnvironment()) {
        window.addEventListener('keydown', handleEscapeKey);
    }
}, { immediate: true });

onBeforeUnmount(() => {
    removeEscapeListener();
    releaseScrollLock?.();
    releaseScrollLock = null;
});
</script>

<template>
    <Teleport
        v-if="canTeleport"
        to="body"
    >
        <div
            v-if="open"
            class="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-6"
        >
            <div
                :class="overlayBackdropClass"
                @click="handleBackdropClick"
            />

            <section
                role="dialog"
                aria-modal="true"
                :aria-labelledby="title ? titleId : undefined"
                :aria-describedby="description ? descriptionId : undefined"
                :class="[resolveModalPanelClasses(size), 'relative z-[1] w-full rounded-b-none sm:rounded-[1.75rem]']"
                @click.stop
            >
                <header
                    v-if="hasHeader"
                    class="flex items-start justify-between gap-4 px-4 pb-4 pt-4 sm:px-5 sm:pt-5"
                >
                    <div class="min-w-0 space-y-1">
                        <slot name="header">
                            <h2
                                v-if="title"
                                :id="titleId"
                                class="text-lg font-semibold tracking-[-0.02em] text-neutral-50"
                            >
                                {{ title }}
                            </h2>
                            <p
                                v-if="description"
                                :id="descriptionId"
                                class="text-sm leading-6 text-neutral-400"
                            >
                                {{ description }}
                            </p>
                        </slot>
                    </div>

                    <button
                        v-if="showClose"
                        type="button"
                        class="inline-flex min-h-10 min-w-10 items-center justify-center rounded-[1.25rem] border border-white/10 bg-white/6 text-neutral-200 transition duration-200 ease-out hover:bg-white/10"
                        @click="requestClose('button')"
                    >
                        <span class="sr-only">Close dialog</span>
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
                </header>

                <div :class="panelPaddingClass">
                    <slot />
                </div>

                <footer
                    v-if="$slots.footer"
                    class="border-t border-white/8 px-4 py-4 sm:px-5"
                >
                    <slot name="footer" />
                </footer>
            </section>
        </div>
    </Teleport>
</template>
