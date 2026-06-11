<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { useI18n } from '@/i18n';

type PrimaryNavigationItem = {
  to: string;
  label: string;
  shortLabel: string;
  eyebrow: string;
  description: string;
};

const { t } = useI18n();
const route = useRoute();

const primaryNavigation = computed<PrimaryNavigationItem[]>(() => [
  {
    to: '/chat',
    label: t.value.nav.chat,
    shortLabel: t.value.nav.chat,
    eyebrow: t.value.shell.navEyebrows.chat,
    description: t.value.shell.navDescriptions.chat,
  },
  {
    to: '/characters',
    label: t.value.nav.characters,
    shortLabel: t.value.nav.characters,
    eyebrow: t.value.shell.navEyebrows.characters,
    description: t.value.shell.navDescriptions.characters,
  },
  {
    to: '/worldbooks',
    label: t.value.nav.worldbooks,
    shortLabel: t.value.nav.worldbooks,
    eyebrow: t.value.shell.navEyebrows.worldbooks,
    description: t.value.shell.navDescriptions.worldbooks,
  },
  {
    to: '/connection',
    label: t.value.nav.connection,
    shortLabel: t.value.nav.connection,
    eyebrow: t.value.shell.navEyebrows.connection,
    description: t.value.shell.navDescriptions.connection,
  },
  {
    to: '/settings',
    label: t.value.nav.settings,
    shortLabel: t.value.nav.settings,
    eyebrow: t.value.shell.navEyebrows.settings,
    description: t.value.shell.navDescriptions.settings,
  },
]);
const currentNavigationItem = computed(() => primaryNavigation.value.find((item) => isCurrentPath(item.to)) ?? null);
const currentTitle = computed(() => (
  currentNavigationItem.value?.label ??
  (route.name === 'dev-home' ? t.value.nav.dev : null) ??
  (typeof route.meta.title === 'string' ? route.meta.title : t.value.app.name)
));
const currentDescription = computed(() => (
  currentNavigationItem.value?.description ??
  (route.name === 'dev-home' ? t.value.shell.debugDescription : null) ??
  (typeof route.meta.description === 'string' ? route.meta.description : t.value.app.tagline)
));

function isCurrentPath(to: string): boolean {
  return route.path === to || route.path.startsWith(`${to}/`);
}
</script>

<template>
  <div class="shell-frame min-h-dvh text-neutral-50">
    <div class="mx-auto flex min-h-dvh w-full max-w-[112rem]">
      <aside
        class="shell-sidebar hidden w-80 shrink-0 flex-col border-r border-white/10 bg-black/20 px-6 py-6 backdrop-blur-xl md:flex"
      >
        <RouterLink
          to="/chat"
          class="rounded-[2rem] border border-amber-300/20 bg-amber-200/10 px-5 py-5 transition hover:border-amber-200/40 hover:bg-amber-200/14"
        >
          <p class="text-[0.68rem] font-black uppercase tracking-[0.28em] text-amber-100/75">
            {{ t.shell.brandEyebrow }}
          </p>
          <h1 class="mt-3 font-display text-2xl font-black text-white">
            {{ t.shell.brandTitle }}
          </h1>
          <p class="mt-3 text-sm leading-7 text-neutral-300">
            {{ t.shell.brandDescription }}
          </p>
        </RouterLink>

        <nav class="mt-8 space-y-3" :aria-label="t.nav.primary">
          <RouterLink
            v-for="item in primaryNavigation"
            :key="item.to"
            :to="item.to"
            class="block rounded-[1.6rem] border px-4 py-4 transition"
            :class="isCurrentPath(item.to)
              ? 'border-amber-200/45 bg-amber-200/14 shadow-[0_20px_45px_rgba(251,191,36,0.10)]'
              : 'border-white/8 bg-white/[0.04] hover:border-white/15 hover:bg-white/[0.07]'"
          >
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-[0.66rem] font-black uppercase tracking-[0.24em] text-neutral-400">
                  {{ item.eyebrow }}
                </p>
                <p class="mt-2 text-lg font-bold text-white">
                  {{ item.label }}
                </p>
              </div>
              <div
                class="flex h-11 w-11 items-center justify-center rounded-2xl border text-xs font-black uppercase tracking-[0.18em]"
                :class="isCurrentPath(item.to)
                  ? 'border-amber-100/30 bg-amber-100/12 text-amber-50'
                  : 'border-white/10 bg-black/15 text-neutral-300'"
              >
                {{ item.shortLabel }}
              </div>
            </div>
            <p class="mt-3 text-sm leading-6 text-neutral-300">
              {{ item.description }}
            </p>
          </RouterLink>
        </nav>

        <div class="mt-auto rounded-[1.8rem] border border-white/10 bg-white/[0.05] p-5">
          <p class="text-[0.66rem] font-black uppercase tracking-[0.24em] text-teal-200/80">
            {{ t.shell.debugEyebrow }}
          </p>
          <p class="mt-3 text-lg font-bold text-white">
            {{ t.shell.debugTitle }}
          </p>
          <p class="mt-2 text-sm leading-6 text-neutral-300">
            {{ t.shell.debugDescription }}
          </p>
          <RouterLink
            to="/dev"
            class="mt-4 inline-flex items-center rounded-full border border-white/15 bg-white/[0.07] px-4 py-2 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-white/[0.12]"
          >
            {{ t.shell.debugOpen }}
          </RouterLink>
        </div>
      </aside>

      <div class="flex min-h-dvh min-w-0 flex-1 flex-col">
        <header class="safe-top sticky top-0 z-20 border-b border-white/8 bg-neutral-950/80 px-4 pb-4 pt-3 backdrop-blur-xl md:hidden">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <p class="text-[0.66rem] font-black uppercase tracking-[0.24em] text-amber-100/70">
                {{ t.app.name }}
              </p>
              <h1 class="mt-2 truncate font-display text-2xl font-black text-white">
                {{ currentTitle }}
              </h1>
              <p class="mt-2 text-sm leading-6 text-neutral-300">
                {{ currentDescription }}
              </p>
            </div>
            <RouterLink
              to="/dev"
              class="inline-flex min-h-10 shrink-0 items-center rounded-full border border-white/12 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white"
            >
              {{ t.shell.debugShort }}
            </RouterLink>
          </div>
        </header>

        <header class="safe-top hidden items-start justify-between gap-6 px-8 pb-2 pt-7 md:flex">
          <div class="min-w-0">
            <p class="text-[0.68rem] font-black uppercase tracking-[0.26em] text-amber-100/70">
              {{ t.shell.desktopEyebrow }}
            </p>
            <h2 class="mt-3 font-display text-4xl font-black text-white">
              {{ currentTitle }}
            </h2>
            <p class="mt-3 max-w-3xl text-sm leading-7 text-neutral-300">
              {{ currentDescription }}
            </p>
          </div>
          <RouterLink
            to="/dev"
            class="mt-1 shrink-0 rounded-full border border-white/12 bg-white/[0.05] px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.1]"
          >
            {{ t.shell.debugOpen }}
          </RouterLink>
        </header>

        <main class="flex-1 px-4 pb-28 pt-6 sm:px-6 md:px-8 md:pb-10 md:pt-6">
          <RouterView />
        </main>

        <nav
          class="shell-bottom-nav safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-white/8 bg-neutral-950/90 px-3 pt-3 backdrop-blur-xl md:hidden"
          :aria-label="t.nav.bottom"
        >
          <div class="grid grid-cols-5 gap-2">
            <RouterLink
              v-for="item in primaryNavigation"
              :key="`${item.to}-mobile`"
              :to="item.to"
              class="flex min-h-16 flex-col items-center justify-center rounded-[1.25rem] border px-2 py-2 text-center transition"
              :class="isCurrentPath(item.to)
                ? 'border-amber-200/35 bg-amber-200/14 text-white'
                : 'border-white/8 bg-white/[0.03] text-neutral-300'"
            >
              <span class="text-[0.58rem] font-black uppercase tracking-[0.22em] text-neutral-400">
                {{ item.eyebrow }}
              </span>
              <span class="mt-1 text-xs font-bold">
                {{ item.shortLabel }}
              </span>
            </RouterLink>
          </div>
        </nav>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shell-frame {
  position: relative;
  isolation: isolate;
  background:
    radial-gradient(circle at top left, rgba(251, 191, 36, 0.12), transparent 32%),
    radial-gradient(circle at bottom right, rgba(45, 212, 191, 0.14), transparent 34%),
    linear-gradient(180deg, #09090b 0%, #111827 100%);
}

.shell-frame::before,
.shell-frame::after {
  position: absolute;
  z-index: -1;
  border-radius: 999px;
  content: '';
  filter: blur(18px);
  opacity: 0.7;
  pointer-events: none;
}

.shell-frame::before {
  top: -7rem;
  right: 8%;
  width: 18rem;
  height: 18rem;
  background: rgba(251, 191, 36, 0.18);
}

.shell-frame::after {
  bottom: 8%;
  left: -6rem;
  width: 20rem;
  height: 20rem;
  background: rgba(45, 212, 191, 0.12);
}

.safe-top {
  padding-top: max(0.75rem, env(safe-area-inset-top));
}

.safe-bottom {
  padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
}

.shell-sidebar {
  padding-top: max(1.5rem, env(safe-area-inset-top));
  padding-bottom: max(1.5rem, env(safe-area-inset-bottom));
}

.shell-bottom-nav {
  padding-left: max(0.75rem, env(safe-area-inset-left));
  padding-right: max(0.75rem, env(safe-area-inset-right));
}
</style>
