import { afterEach, describe, expect, it } from 'vitest';
import { acquireBodyScrollLock } from './overlayRuntime';

const runtimeGlobal = globalThis as typeof globalThis & {
    window?: Window & typeof globalThis;
    document?: Document;
};

const originalWindow = runtimeGlobal.window;
const originalDocument = runtimeGlobal.document;

afterEach(() => {
    runtimeGlobal.window = originalWindow;
    runtimeGlobal.document = originalDocument;
});

describe('acquireBodyScrollLock', () => {
    it('locks and restores body overflow in browser-like environments', () => {
        const body = { style: { overflow: 'auto' } };
        const fakeDocument = { body } as Document;

        runtimeGlobal.document = fakeDocument;
        runtimeGlobal.window = globalThis as Window & typeof globalThis;

        const releaseFirst = acquireBodyScrollLock();
        expect(body.style.overflow).toBe('hidden');

        const releaseSecond = acquireBodyScrollLock();
        releaseSecond();
        expect(body.style.overflow).toBe('hidden');

        releaseFirst();
        expect(body.style.overflow).toBe('auto');
    });

    it('becomes a no-op outside the browser', () => {
        (runtimeGlobal as { window?: Window & typeof globalThis }).window = undefined;
        (runtimeGlobal as { document?: Document }).document = undefined;

        expect(() => acquireBodyScrollLock()).not.toThrow();
    });
});
