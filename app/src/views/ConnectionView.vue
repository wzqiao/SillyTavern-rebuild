<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <section class="mx-auto grid w-full max-w-6xl gap-6">
    <div class="rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-[0_28px_80px_rgba(0,0,0,0.28)] backdrop-blur xl:p-8">
      <p class="text-[0.68rem] font-black uppercase tracking-[0.28em] text-emerald-200/75">
        Connection
      </p>
      <h1 class="mt-3 text-3xl font-black tracking-[-0.05em] text-white sm:text-4xl">
        Provider setup is now a first-class step.
      </h1>
      <p class="mt-4 max-w-3xl text-sm leading-7 text-neutral-300">
        Separating connection work from the chat surface makes room for a guided provider flow, runtime diagnostics,
        and clearer readiness messaging while keeping API keys in the transient vault path described by ADR-003.
      </p>
      <div class="mt-6 flex flex-wrap gap-3">
        <RouterLink
          to="/chat"
          class="rounded-full border border-white/12 bg-white/[0.05] px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.1]"
        >
          Continue to chat
        </RouterLink>
        <RouterLink
          to="/dev"
          class="rounded-full border border-white/12 bg-transparent px-5 py-3 text-sm font-semibold text-neutral-300 transition hover:border-white/20 hover:text-white"
        >
          Use current draft panel on /dev
        </RouterLink>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <article class="rounded-[1.7rem] border border-white/10 bg-black/20 p-5">
        <p class="text-sm font-semibold text-white">Why a separate page</p>
        <p class="mt-3 text-sm leading-6 text-neutral-300">
          Users can now think in sequence: configure a model, choose a character, then start the conversation.
        </p>
      </article>
      <article class="rounded-[1.7rem] border border-white/10 bg-black/20 p-5">
        <p class="text-sm font-semibold text-white">Next integration step</p>
        <p class="mt-3 text-sm leading-6 text-neutral-300">
          B5 can plug the existing connection store into this surface without changing the shell or route contract again.
        </p>
      </article>
    </div>
  </section>
</template>
