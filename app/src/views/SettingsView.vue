<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <section class="mx-auto grid w-full max-w-6xl gap-6">
    <div class="rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-[0_28px_80px_rgba(0,0,0,0.28)] backdrop-blur xl:p-8">
      <p class="text-[0.68rem] font-black uppercase tracking-[0.28em] text-fuchsia-200/75">
        Preferences
      </p>
      <h1 class="mt-3 text-3xl font-black tracking-[-0.05em] text-white sm:text-4xl">
        Settings get room for progressive disclosure.
      </h1>
      <p class="mt-4 max-w-3xl text-sm leading-7 text-neutral-300">
        This route is reserved for the simple-versus-advanced split described in the PRD, so common controls stay calm
        and powerful options can expand only when the user asks for them.
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
          Review current controls on /dev
        </RouterLink>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-3">
      <article class="rounded-[1.7rem] border border-white/10 bg-black/20 p-5">
        <p class="text-sm font-semibold text-white">Simple mode</p>
        <p class="mt-3 text-sm leading-6 text-neutral-300">
          The default surface should only show the controls a new user actually needs to get a conversation started.
        </p>
      </article>
      <article class="rounded-[1.7rem] border border-white/10 bg-black/20 p-5">
        <p class="text-sm font-semibold text-white">Advanced mode</p>
        <p class="mt-3 text-sm leading-6 text-neutral-300">
          Sampling and expert settings will be tucked into collapsible sections once the ui-kit collapse primitives arrive.
        </p>
      </article>
      <article class="rounded-[1.7rem] border border-white/10 bg-black/20 p-5">
        <p class="text-sm font-semibold text-white">Current status</p>
        <p class="mt-3 text-sm leading-6 text-neutral-300">
          This placeholder keeps the navigation contract stable now, so B6 can focus on UX polish instead of route plumbing.
        </p>
      </article>
    </div>
  </section>
</template>
