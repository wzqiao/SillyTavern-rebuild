<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue';
import type { DrawerPlacement, DrawerSize } from './overlay';
import { overlayBackdropClass, resolveDrawerPanelClasses, resolveDrawerShellClasses } from './overlay';
import { acquireBodyScrollLock } from './overlayRuntime';
import { createUiId, isBrowserEnvironment } from './utils';

const props = withDefaults(defineProps<{
    open: boolean;
    title?: string;
    description?: string;
    placement?: DrawerPlacement;
    size?: DrawerSize;
    closeOnBackdrop?: boolean;
    closeOnEscape?: boolean;
    showClose?: boolean;
}>(), {
    title: undefined,
    description: undefined,
    placement: 'bottom',
    size: 'md',
    closeOnBackdrop: true,
    closeOnEscape: true,
    showClose: true,
});

const emit = defineEmits<{
    'update:open': [value: boolean];
    close: [reason: 'backdrop' | 'escape' | 'button'];
    open: [];
}>();

const titleId = createUiId('drawer-title');
const descriptionId = createUiId('drawer-description');
const canTeleport = isBrowserEnvironment();

let releaseScrollLock: (() => void) | null = null;

const contentPaddingClass = computed(() => props.placement === 'bottom' ? 'pt-4' : 'pt-5');

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
            :class="resolveDrawerShellClasses(placement)"
        >
            <div
                :class="overlayBackdropClass"
                @click="handleBackdropClick"
            />

            <aside
                role="dialog"
                aria-modal="true"
                :aria-labelledby="title ? titleId : undefined"
                :aria-describedby="description ? descriptionId : undefined"
                :class="[resolveDrawerPanelClasses(placement, size), 'relative z-[1] overflow-y-auto']"
                @click.stop
            >
                <div
                    v-if="placement === 'bottom'"
                    class="mx-auto mb-3 h-1.5 w-14 rounded-full bg-white/12"
                    aria-hidden="true"
                />

                <header class="flex items-start justify-between gap-4">
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
                        class="inline-flex min-h-10 min-w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/6 text-neutral-200 transition duration-200 ease-out hover:bg-white/10"
                        @click="requestClose('button')"
                    >
                        <span class="sr-only">Close drawer</span>
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

                <div :class="contentPaddingClass">
                    <slot />
                </div>

                <footer
                    v-if="$slots.footer"
                    class="mt-4 border-t border-white/8 pt-4"
                >
                    <slot name="footer" />
                </footer>
            </aside>
        </div>
    </Teleport>
</template>
