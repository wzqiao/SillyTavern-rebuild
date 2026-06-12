<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';

/**
 * Igloo-style text scramble: when `text` changes, characters resolve from a
 * field of technical glyphs into the target string. Falls back to a direct
 * swap when the user prefers reduced motion.
 */

const props = withDefaults(defineProps<{
    text: string;
    duration?: number;
}>(), {
    duration: 460,
});

const GLYPHS = '█▓▒░◢◤◇/\\|<>=+*·01';

const display = ref(props.text);

let frameId = 0;

watch(() => props.text, (next) => {
    window.cancelAnimationFrame(frameId);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        display.value = next;
        return;
    }

    const characters = Array.from(next);
    const start = performance.now();

    const step = (now: number): void => {
        const progress = Math.min((now - start) / props.duration, 1);
        const settled = Math.floor(progress * characters.length);
        let output = characters.slice(0, settled).join('');

        for (let index = settled; index < characters.length; index += 1) {
            output += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        }

        display.value = output;

        if (progress < 1) {
            frameId = window.requestAnimationFrame(step);
        } else {
            display.value = next;
        }
    };

    frameId = window.requestAnimationFrame(step);
});

onBeforeUnmount(() => {
    window.cancelAnimationFrame(frameId);
});
</script>

<template>
    <span>{{ display }}</span>
</template>
