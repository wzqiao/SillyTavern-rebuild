import { afterEach, describe, expect, it } from 'vitest';
import { loadLegacyRuntimeModules, resetLegacyRuntimeHost } from './legacyRuntimeHost';

const runtimeGlobal = globalThis as typeof globalThis & {
  window?: Window & typeof globalThis;
  document?: Document;
};

const originalWindow = runtimeGlobal.window;
const originalDocument = runtimeGlobal.document;

afterEach(() => {
  resetLegacyRuntimeHost();
  runtimeGlobal.window = originalWindow;
  runtimeGlobal.document = originalDocument;
});

describe('loadLegacyRuntimeModules', () => {
  it('rejects outside browser-like environments', async () => {
    (runtimeGlobal as { window?: Window & typeof globalThis }).window = undefined;
    (runtimeGlobal as { document?: Document }).document = undefined;

    await expect(loadLegacyRuntimeModules()).rejects.toThrow(
      'A browser document is required to load the SillyTavern runtime host.',
    );
  });

  it('clears a failed host load so a later attempt can retry', async () => {
    runtimeGlobal.window = {
      clearTimeout,
      clearInterval,
      setTimeout,
      setInterval,
    } as Window & typeof globalThis;
    runtimeGlobal.document = {
      createElement: () => ({
        addEventListener: (_eventName: string, handler: () => void) => {
          handler();
        },
        dataset: {},
        remove: () => undefined,
        removeEventListener: () => undefined,
        setAttribute: () => undefined,
        style: {},
      }),
      body: {
        appendChild: () => undefined,
      },
    } as unknown as Document;

    await expect(loadLegacyRuntimeModules({ timeoutMs: 1 })).rejects.toThrow(
      'SillyTavern runtime host is not same-origin or has no document body.',
    );
    await expect(loadLegacyRuntimeModules({ timeoutMs: 1 })).rejects.toThrow(
      'SillyTavern runtime host is not same-origin or has no document body.',
    );
  });
});
