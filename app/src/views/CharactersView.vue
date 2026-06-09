<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <section class="mx-auto grid w-full max-w-6xl gap-6">
    <div class="rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-[0_28px_80px_rgba(0,0,0,0.28)] backdrop-blur xl:p-8">
      <p class="text-[0.68rem] font-black uppercase tracking-[0.28em] text-teal-200/75">
        Cast
      </p>
      <h1 class="mt-3 text-3xl font-black tracking-[-0.05em] text-white sm:text-4xl">
        Character management gets its own workspace.
      </h1>
      <p class="mt-4 max-w-3xl text-sm leading-7 text-neutral-300">
        Importing V2/V3 cards, browsing the roster, and selecting the active character now have a dedicated destination
        instead of competing with connection fields and lore controls on one oversized page.
      </p>
      <div class="mt-6 flex flex-wrap gap-3">
        <RouterLink
          to="/chat"
          class="rounded-full border border-white/12 bg-white/[0.05] px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.1]"
        >
          Back to chat
        </RouterLink>
        <RouterLink
          to="/dev"
          class="rounded-full border border-white/12 bg-transparent px-5 py-3 text-sm font-semibold text-neutral-300 transition hover:border-white/20 hover:text-white"
        >
          Use current importer on /dev
        </RouterLink>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <article class="rounded-[1.7rem] border border-white/10 bg-black/20 p-5">
        <p class="text-sm font-semibold text-white">Planned surface</p>
        <p class="mt-3 text-sm leading-6 text-neutral-300">
          The next step is a compact import flow, active-character summary, and roster list that reads well on narrow screens.
        </p>
      </article>
      <article class="rounded-[1.7rem] border border-white/10 bg-black/20 p-5">
        <p class="text-sm font-semibold text-white">Current fallback</p>
        <p class="mt-3 text-sm leading-6 text-neutral-300">
          Until B3 lands, the full import and selection workflow still lives in the preserved `/dev` workbench.
        </p>
      </article>
    </div>
  </section>
</template>
