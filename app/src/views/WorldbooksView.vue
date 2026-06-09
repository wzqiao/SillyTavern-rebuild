<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <section class="mx-auto grid w-full max-w-6xl gap-6">
    <div class="rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-[0_28px_80px_rgba(0,0,0,0.28)] backdrop-blur xl:p-8">
      <p class="text-[0.68rem] font-black uppercase tracking-[0.28em] text-sky-200/75">
        Lore
      </p>
      <h1 class="mt-3 text-3xl font-black tracking-[-0.05em] text-white sm:text-4xl">
        Worldbooks no longer hide inside the chat workbench.
      </h1>
      <p class="mt-4 max-w-3xl text-sm leading-7 text-neutral-300">
        This route is reserved for library browsing, active-worldbook selection, and injection previews so lore controls can
        grow without burying the primary conversation flow.
      </p>
      <div class="mt-6 flex flex-wrap gap-3">
        <RouterLink
          to="/chat"
          class="rounded-full border border-white/12 bg-white/[0.05] px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.1]"
        >
          Return to chat
        </RouterLink>
        <RouterLink
          to="/dev"
          class="rounded-full border border-white/12 bg-transparent px-5 py-3 text-sm font-semibold text-neutral-300 transition hover:border-white/20 hover:text-white"
        >
          Inspect current lore preview on /dev
        </RouterLink>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-3">
      <article class="rounded-[1.7rem] border border-white/10 bg-black/20 p-5">
        <p class="text-sm font-semibold text-white">Mobile-first goal</p>
        <p class="mt-3 text-sm leading-6 text-neutral-300">
          Large entry lists and previews will stack cleanly on phones instead of relying on desktop-only drawer patterns.
        </p>
      </article>
      <article class="rounded-[1.7rem] border border-white/10 bg-black/20 p-5">
        <p class="text-sm font-semibold text-white">Engine boundary</p>
        <p class="mt-3 text-sm leading-6 text-neutral-300">
          This page stays UI-only and continues to consume the existing headless store and service contracts.
        </p>
      </article>
      <article class="rounded-[1.7rem] border border-white/10 bg-black/20 p-5">
        <p class="text-sm font-semibold text-white">B3 handoff</p>
        <p class="mt-3 text-sm leading-6 text-neutral-300">
          The dedicated route is ready now, so store wiring can land without rethinking the shell again.
        </p>
      </article>
    </div>
  </section>
</template>
