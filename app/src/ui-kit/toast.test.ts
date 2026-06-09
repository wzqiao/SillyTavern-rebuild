import { describe, expect, it } from 'vitest';
import { resolveToastDuration, resolveToastStackClasses } from './toast';

describe('toast helpers', () => {
    it('uses item duration when present and clamps negative values to zero', () => {
        expect(resolveToastDuration({
            id: 'a',
            title: 'Saved',
            durationMs: 2500,
        }, 4000)).toBe(2500);

        expect(resolveToastDuration({
            id: 'b',
            title: 'Pinned',
            durationMs: -50,
        }, 4000)).toBe(0);
    });

    it('resolves stack placement classes', () => {
        const classes = resolveToastStackClasses('bottom', 'end');

        expect(classes).toContain('bottom-0');
        expect(classes).toContain('items-end');
    });
});
