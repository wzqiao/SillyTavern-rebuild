import {
  createMemoryHistory,
  createRouter,
  createWebHashHistory,
  type RouteRecordRaw,
  type RouterHistory,
} from 'vue-router';

export const appRoutes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/components/AppShell.vue'),
    children: [
      {
        path: '',
        redirect: { name: 'chat' },
      },
      {
        path: 'chat',
        name: 'chat',
        component: () => import('@/views/ChatView.vue'),
        meta: {
          title: 'Chat',
          description: 'Conversation becomes the default product entry instead of the single-page workbench.',
        },
      },
      {
        path: 'characters',
        name: 'characters',
        component: () => import('@/views/CharactersView.vue'),
        meta: {
          title: 'Characters',
          description: 'Character import and roster management now live on their own dedicated route.',
        },
      },
      {
        path: 'worldbooks',
        name: 'worldbooks',
        component: () => import('@/views/WorldbooksView.vue'),
        meta: {
          title: 'Worldbooks',
          description: 'Lorebook browsing and activation are split into a standalone workspace.',
        },
      },
      {
        path: 'connection',
        name: 'connection',
        component: () => import('@/views/ConnectionView.vue'),
        meta: {
          title: 'Connection',
          description: 'Provider setup, draft handoff, and runtime readiness checks get a focused home.',
        },
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('@/views/SettingsView.vue'),
        meta: {
          title: 'Settings',
          description: 'Progressive disclosure for advanced controls will land here without crowding core flows.',
        },
      },
    ],
  },
  {
    path: '/dev',
    name: 'dev-home',
    component: () => import('@/views/HomeView.vue'),
    meta: {
      title: 'Dev Workbench',
      description: 'Legacy M0 workbench preserved for debugging while B3 splits pages into dedicated views.',
    },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: { name: 'chat' },
  },
];

function createRouterHistory(): RouterHistory {
  // Use memory history during tests so the router module stays importable without a browser location object.
  if (typeof globalThis.location === 'undefined') {
    return createMemoryHistory();
  }

  return createWebHashHistory();
}

export function createAppRouter() {
  return createRouter({
    history: createRouterHistory(),
    routes: appRoutes,
    scrollBehavior: () => ({ left: 0, top: 0 }),
  });
}

export const router = createAppRouter();
