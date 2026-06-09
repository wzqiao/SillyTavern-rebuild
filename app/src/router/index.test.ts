import { describe, expect, it } from 'vitest';
import { appRoutes, createAppRouter } from './index';

describe('app router', () => {
  it('defines the app shell with the primary product routes', () => {
    const shellRoute = appRoutes.find((route) => route.path === '/' && Array.isArray(route.children));

    expect(shellRoute).toBeDefined();

    if (!shellRoute || !shellRoute.children) {
      throw new Error('Expected the shell route to expose child routes.');
    }

    expect(shellRoute.children.map((route) => route.path)).toEqual([
      '',
      'chat',
      'characters',
      'worldbooks',
      'connection',
      'settings',
    ]);

    expect(shellRoute.children.slice(1).map((route) => route.name)).toEqual([
      'chat',
      'characters',
      'worldbooks',
      'connection',
      'settings',
    ]);

    expect(shellRoute.children.slice(1).map((route) => route.meta?.title)).toEqual([
      'Chat',
      'Characters',
      'Worldbooks',
      'Connection',
      'Settings',
    ]);

    expect(appRoutes.find((route) => route.path === '/dev')?.name).toBe('dev-home');
  });

  it('redirects root to chat and keeps the debug route reachable', async () => {
    const router = createAppRouter();

    await router.push('/');
    await router.isReady();
    expect(router.currentRoute.value.fullPath).toBe('/chat');

    await router.push('/settings');
    expect(router.currentRoute.value.name).toBe('settings');

    await router.push('/dev');
    expect(router.currentRoute.value.name).toBe('dev-home');
  });
});
