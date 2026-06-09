import { describe, expect, it } from 'vitest';
import { getInitialTabId, resolveTabTriggerClasses, resolveTabsListClasses } from './tabs';

const items = [
    { id: 'chat', label: 'Chat' },
    { id: 'settings', label: 'Settings', disabled: true },
    { id: 'worldbooks', label: 'Worldbooks' },
] as const;

describe('tabs helpers', () => {
    it('prefers the requested enabled tab and falls back to the first enabled tab', () => {
        expect(getInitialTabId(items, 'worldbooks')).toBe('worldbooks');
        expect(getInitialTabId(items, 'settings')).toBe('chat');
        expect(getInitialTabId(items, null)).toBe('chat');
    });

    it('returns null when every tab is disabled', () => {
        expect(getInitialTabId([{ id: 'x', label: 'Hidden', disabled: true }], null)).toBeNull();
    });

    it('resolves list and trigger classes for active underline tabs', () => {
        expect(resolveTabsListClasses('underline', true)).toContain('border-b');

        const classes = resolveTabTriggerClasses(true, 'underline', 'sm', false);
        expect(classes).toContain('border-cyan-300');
        expect(classes).toContain('min-h-10');
    });
});
