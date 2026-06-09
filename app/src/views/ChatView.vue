<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <section class="mx-auto grid w-full max-w-6xl gap-6">
    <div class="rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-[0_28px_80px_rgba(0,0,0,0.28)] backdrop-blur xl:p-8">
      <p class="text-[0.68rem] font-black uppercase tracking-[0.28em] text-amber-100/75">
        Conversation
      </p>
      <h1 class="mt-3 text-3xl font-black tracking-[-0.05em] text-white sm:text-4xl">
        Chat is now the default landing route.
      </h1>
      <p class="mt-4 max-w-3xl text-sm leading-7 text-neutral-300">
        The giant workbench no longer owns the first screen. This page is the durable home for streaming replies,
        composer actions, swipe controls, and chat-specific polish once B3 and B4 wire the stores into the new layout.
      </p>
      <div class="mt-6 flex flex-wrap gap-3">
        <RouterLink
          to="/connection"
          class="rounded-full border border-amber-200/35 bg-amber-200/14 px-5 py-3 text-sm font-semibold text-white transition hover:border-amber-100/50 hover:bg-amber-200/20"
        >
          Configure connection
        </RouterLink>
        <RouterLink
          to="/characters"
          class="rounded-full border border-white/12 bg-white/[0.05] px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.1]"
        >
          Pick a character
        </RouterLink>
        <RouterLink
          to="/dev"
          class="rounded-full border border-white/12 bg-transparent px-5 py-3 text-sm font-semibold text-neutral-300 transition hover:border-white/20 hover:text-white"
        >
          Open legacy /dev workbench
        </RouterLink>
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-3">
      <article class="rounded-[1.7rem] border border-white/10 bg-black/20 p-5">
        <p class="text-sm font-semibold text-white">What lands here next</p>
        <p class="mt-3 text-sm leading-6 text-neutral-300">
          ChatView will host the message timeline, streaming deltas, stop/regenerate actions, and mobile-first composer controls.
        </p>
      </article>
      <article class="rounded-[1.7rem] border border-white/10 bg-black/20 p-5">
        <p class="text-sm font-semibold text-white">Why this split matters</p>
        <p class="mt-3 text-sm leading-6 text-neutral-300">
          Navigation now mirrors the mental model of the product: connect first, choose a character, then chat with optional lore.
        </p>
      </article>
      <article class="rounded-[1.7rem] border border-white/10 bg-black/20 p-5">
        <p class="text-sm font-semibold text-white">Parallel-worktree note</p>
        <p class="mt-3 text-sm leading-6 text-neutral-300">
          B1 is shipping the ui-kit separately, so these placeholders stay on raw Tailwind primitives and can be swapped later.
        </p>
      </article>
    </div>
  </section>
</template>
