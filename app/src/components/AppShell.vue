<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import ScrambleText from './ScrambleText.vue';
import MultiplayerRoomPanel from './MultiplayerRoomPanel.vue';
import { Drawer } from '@/ui-kit';
import { useI18n } from '@/i18n';
import { useMultiplayerStore } from '@/stores';

const AtmosphereCanvas = defineAsyncComponent(() => import('./AtmosphereCanvas.vue'));

const multiplayerStore = useMultiplayerStore();
const multiplayerDrawerOpen = ref(false);

type PrimaryNavigationItem = {
  to: string;
  label: string;
  shortLabel: string;
  eyebrow: string;
  description: string;
  iconPaths: string[];
};

const ICON_PATHS: Record<string, string[]> = {
  chat: [
    'M3.5 5.25A1.75 1.75 0 015.25 3.5h9.5a1.75 1.75 0 011.75 1.75v6.5a1.75 1.75 0 01-1.75 1.75H9.6L6 16.5v-3h-.75A1.75 1.75 0 013.5 11.75z',
  ],
  characters: [
    'M10 4.25a2.9 2.9 0 110 5.8 2.9 2.9 0 010-5.8z',
    'M4.6 16.25c.85-2.7 3-4.15 5.4-4.15s4.55 1.45 5.4 4.15',
  ],
  worldbooks: [
    'M6.25 3.5h8.25v13H6.25A2.25 2.25 0 014 14.25V5.75A2.25 2.25 0 016.25 3.5z',
    'M4 14.25c0-1.24 1-2.25 2.25-2.25h8.25',
  ],
  connection: [
    'M11.2 3L5.4 11h3.7l-.9 6 5.8-8h-3.7l.9-6z',
  ],
  settings: [
    'M3.75 6h12.5M3.75 10h12.5M3.75 14h12.5',
    'M12.4 6m-1.6 0a1.6 1.6 0 103.2 0a1.6 1.6 0 10-3.2 0',
    'M7 10m-1.6 0a1.6 1.6 0 103.2 0a1.6 1.6 0 10-3.2 0',
    'M10.8 14m-1.6 0a1.6 1.6 0 103.2 0a1.6 1.6 0 10-3.2 0',
  ],
  dev: [
    'M3.5 4.5h13v11h-13z',
    'M6.5 8l2.4 2.4L6.5 12.8',
    'M10.8 13h2.7',
  ],
  multiplayer: [
    'M10 4a3 3 0 100 6 3 3 0 000-6z',
    'M4.5 16.5c.8-2.6 2.8-4 5.5-4s4.7 1.4 5.5 4',
    'M14 5.5a2.2 2.2 0 110 4.4',
    'M16 16c.6-1.8 1.8-2.8 3.2-3.2',
  ],
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
    iconPaths: ICON_PATHS.chat,
  },
  {
    to: '/characters',
    label: t.value.nav.characters,
    shortLabel: t.value.nav.characters,
    eyebrow: t.value.shell.navEyebrows.characters,
    description: t.value.shell.navDescriptions.characters,
    iconPaths: ICON_PATHS.characters,
  },
  {
    to: '/worldbooks',
    label: t.value.nav.worldbooks,
    shortLabel: t.value.nav.worldbooks,
    eyebrow: t.value.shell.navEyebrows.worldbooks,
    description: t.value.shell.navDescriptions.worldbooks,
    iconPaths: ICON_PATHS.worldbooks,
  },
  {
    to: '/connection',
    label: t.value.nav.connection,
    shortLabel: t.value.nav.connection,
    eyebrow: t.value.shell.navEyebrows.connection,
    description: t.value.shell.navDescriptions.connection,
    iconPaths: ICON_PATHS.connection,
  },
  {
    to: '/settings',
    label: t.value.nav.settings,
    shortLabel: t.value.nav.settings,
    eyebrow: t.value.shell.navEyebrows.settings,
    description: t.value.shell.navDescriptions.settings,
    iconPaths: ICON_PATHS.settings,
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
const isChatRoute = computed(() => isCurrentPath('/chat'));

function isCurrentPath(to: string): boolean {
  return route.path === to || route.path.startsWith(`${to}/`);
}

function emitBeacon(event: MouseEvent, active: boolean): void {
  const target = event.currentTarget;

  if (!(target instanceof HTMLElement)) {
    return;
  }

  const rect = target.getBoundingClientRect();
  window.dispatchEvent(new CustomEvent('reforged-beacon', {
    detail: {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      active,
    },
  }));
}
</script>

<template>
  <div class="shell-frame text-neutral-50" :class="isChatRoute ? 'h-dvh overflow-hidden' : 'min-h-dvh'">
    <AtmosphereCanvas />

    <div class="mx-auto flex w-full max-w-[112rem]" :class="isChatRoute ? 'h-dvh' : 'min-h-dvh'">
      <aside
        class="shell-rail glass-panel hidden w-[4.25rem] shrink-0 flex-col items-center border-r border-white/10 px-2 md:flex"
      >
        <RouterLink
          to="/chat"
          class="rail-brand flex h-11 w-11 items-center justify-center rounded-lg border border-amber-200/24 bg-amber-200/10 text-amber-100 transition duration-200 hover:border-amber-200/45 hover:bg-amber-200/16"
          :title="t.app.name"
          :aria-label="t.app.name"
        >
          <svg
            viewBox="0 0 20 20"
            class="h-5 w-5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            aria-hidden="true"
          >
            <path d="M10 2.5L17 10l-7 7.5L3 10z" stroke-linejoin="round" />
            <path d="M10 6.5L13.5 10 10 13.8 6.5 10z" stroke-linejoin="round" />
          </svg>
        </RouterLink>

        <nav class="mt-7 flex flex-col items-center gap-2.5" :aria-label="t.nav.primary">
          <RouterLink
            v-for="item in primaryNavigation"
            :key="item.to"
            :to="item.to"
            class="rail-item relative flex h-11 w-11 items-center justify-center rounded-lg border transition duration-200"
            :class="isCurrentPath(item.to)
              ? 'rail-item--active border-amber-200/45 bg-amber-200/14 text-amber-50 shadow-[0_0_22px_rgba(216,164,95,0.18)]'
              : 'border-white/8 bg-white/[0.04] text-neutral-300 hover:border-white/18 hover:bg-white/[0.08] hover:text-neutral-100'"
            :aria-label="item.label"
            @mouseenter="emitBeacon($event, true)"
            @mouseleave="emitBeacon($event, false)"
          >
            <svg
              viewBox="0 0 20 20"
              class="h-5 w-5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              aria-hidden="true"
            >
              <path
                v-for="(pathData, pathIndex) in item.iconPaths"
                :key="pathIndex"
                :d="pathData"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <span class="rail-flyout">
              <span class="rail-flyout-eyebrow">{{ item.eyebrow }}</span>
              {{ item.label }}
            </span>
          </RouterLink>
        </nav>

        <button
          type="button"
          class="rail-item relative mt-auto flex h-11 w-11 items-center justify-center rounded-lg border transition duration-200"
          :class="multiplayerStore.isConnected
            ? 'border-emerald-300/40 bg-emerald-300/12 text-emerald-100'
            : 'border-white/8 bg-white/[0.04] text-neutral-400 hover:border-white/18 hover:bg-white/[0.08] hover:text-neutral-100'"
          aria-label="多人房间"
          @click="multiplayerDrawerOpen = true"
          @mouseenter="emitBeacon($event, true)"
          @mouseleave="emitBeacon($event, false)"
        >
          <svg
            viewBox="0 0 20 20"
            class="h-5 w-5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            aria-hidden="true"
          >
            <path
              v-for="(pathData, pathIndex) in ICON_PATHS.multiplayer"
              :key="pathIndex"
              :d="pathData"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span
            v-if="multiplayerStore.isConnected"
            class="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(88,195,138,0.6)]"
          />
          <span class="rail-flyout">多人房间</span>
        </button>

        <RouterLink
          to="/dev"
          class="rail-item relative mt-2 flex h-11 w-11 items-center justify-center rounded-lg border transition duration-200"
          :class="route.path.startsWith('/dev')
            ? 'rail-item--active border-amber-200/45 bg-amber-200/14 text-amber-50'
            : 'border-white/8 bg-white/[0.04] text-neutral-400 hover:border-white/18 hover:bg-white/[0.08] hover:text-neutral-100'"
          :aria-label="t.nav.dev"
          @mouseenter="emitBeacon($event, true)"
          @mouseleave="emitBeacon($event, false)"
        >
          <svg
            viewBox="0 0 20 20"
            class="h-5 w-5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            aria-hidden="true"
          >
            <path
              v-for="(pathData, pathIndex) in ICON_PATHS.dev"
              :key="pathIndex"
              :d="pathData"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span class="rail-flyout">{{ t.nav.dev }}</span>
        </RouterLink>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col" :class="isChatRoute ? 'h-dvh min-h-0' : 'min-h-dvh'">
        <header
          v-if="!isChatRoute"
          class="safe-top sticky top-0 z-20 border-b border-white/8 bg-neutral-950/78 px-4 pb-3 pt-3 backdrop-blur-xl md:hidden"
        >
          <div class="flex items-center justify-between gap-4">
            <div class="min-w-0">
              <p class="technical-label text-amber-100/70">
                {{ t.app.name }}
              </p>
              <h1 class="mt-1.5 truncate font-display text-xl font-black text-white">
                <ScrambleText :text="currentTitle" />
              </h1>
            </div>
            <RouterLink
              to="/dev"
              class="inline-flex min-h-10 shrink-0 items-center rounded-md border border-white/12 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white"
            >
              {{ t.shell.debugShort }}
            </RouterLink>
          </div>
        </header>

        <header
          v-if="!isChatRoute"
          class="safe-top hidden items-end justify-between gap-6 px-8 pb-1 pt-6 md:flex"
        >
          <div class="min-w-0">
            <p class="technical-label text-amber-100/70">
              {{ t.shell.desktopEyebrow }}
            </p>
            <h2 class="mt-2 truncate font-display text-3xl font-black text-white">
              <ScrambleText :text="currentTitle" />
            </h2>
          </div>
          <p class="hidden max-w-md truncate pb-1 text-sm text-neutral-400 lg:block">
            {{ currentDescription }}
          </p>
        </header>

        <main
          :class="isChatRoute
            ? 'flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-[5.75rem] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4 md:px-6 md:pb-4 md:pt-4'
            : 'flex-1 px-4 pb-28 pt-6 sm:px-6 md:px-8 md:pb-10 md:pt-6'"
        >
          <RouterView v-slot="{ Component }">
            <Transition name="route" mode="out-in">
              <component :is="Component" />
            </Transition>
          </RouterView>
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
              class="flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-center transition"
              :class="isCurrentPath(item.to)
                ? 'border-amber-200/35 bg-amber-200/14 text-white'
                : 'border-white/8 bg-white/[0.03] text-neutral-300'"
            >
              <svg
                viewBox="0 0 20 20"
                class="h-[1.15rem] w-[1.15rem]"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                aria-hidden="true"
              >
                <path
                  v-for="(pathData, pathIndex) in item.iconPaths"
                  :key="pathIndex"
                  :d="pathData"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span class="text-[0.66rem] font-bold leading-none">
                {{ item.shortLabel }}
              </span>
            </RouterLink>
          </div>
        </nav>
      </div>
    </div>

    <Drawer
      v-model:open="multiplayerDrawerOpen"
      title="多人房间"
      description="链接、昵称和房间密码加入多人角色扮演。"
      placement="left"
      size="lg"
    >
      <MultiplayerRoomPanel />
    </Drawer>
  </div>
</template>

<style scoped>
.shell-frame {
  position: relative;
  isolation: isolate;
}

.shell-frame::before {
  position: absolute;
  z-index: -1;
  content: '';
  pointer-events: none;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(255, 232, 184, 0.026) 1px, transparent 1px),
    linear-gradient(180deg, rgba(255, 232, 184, 0.02) 1px, transparent 1px);
  background-size: 72px 72px;
  mask-image: linear-gradient(180deg, black, transparent 82%);
  opacity: 0.5;
}

.safe-top {
  padding-top: max(0.75rem, env(safe-area-inset-top));
}

.safe-bottom {
  padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
}

.shell-rail {
  padding-top: max(1.25rem, env(safe-area-inset-top));
  padding-bottom: max(1.25rem, env(safe-area-inset-bottom));
}

.shell-bottom-nav {
  padding-left: max(0.75rem, env(safe-area-inset-left));
  padding-right: max(0.75rem, env(safe-area-inset-right));
}

.rail-item--active::before {
  position: absolute;
  top: 50%;
  left: -0.625rem;
  width: 2px;
  height: 1.4rem;
  content: '';
  transform: translateY(-50%);
  border-radius: 999px;
  background: linear-gradient(180deg, transparent, rgba(216, 164, 95, 0.9), transparent);
}

.rail-flyout {
  position: absolute;
  top: 50%;
  left: calc(100% + 0.875rem);
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.45rem 0.7rem;
  border: 1px solid rgba(255, 232, 184, 0.14);
  border-radius: 0.45rem;
  background: rgba(15, 9, 6, 0.94);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
  color: var(--color-neutral-100);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-50%) translateX(-6px);
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.rail-flyout-eyebrow {
  font-family: var(--font-display);
  font-size: 0.56rem;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(216, 164, 95, 0.78);
}

.rail-item:hover .rail-flyout,
.rail-item:focus-visible .rail-flyout,
.rail-brand:hover .rail-flyout {
  opacity: 1;
  transform: translateY(-50%) translateX(0);
}

.route-enter-active {
  transition: opacity 0.26s ease, transform 0.26s ease, filter 0.26s ease;
}

.route-leave-active {
  transition: opacity 0.16s ease, filter 0.16s ease;
}

.route-enter-from {
  opacity: 0;
  transform: translateY(10px);
  filter: blur(6px);
}

.route-leave-to {
  opacity: 0;
  filter: blur(4px);
}
</style>
