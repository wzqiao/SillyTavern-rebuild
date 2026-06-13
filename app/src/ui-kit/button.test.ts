import { describe, expect, it } from 'vitest';
import { resolveButtonClasses } from './button';

describe('resolveButtonClasses', () => {
    it('uses primary medium button styles by default', () => {
        const classes = resolveButtonClasses();

        expect(classes).toContain('bg-amber-300');
        expect(classes).toContain('min-h-12');
        expect(classes).toContain('rounded-lg');
    });

    it('applies variant, size, and loading modifiers', () => {
        const classes = resolveButtonClasses({
            variant: 'danger',
            size: 'lg',
            block: true,
            loading: true,
        });

        expect(classes).toContain('bg-rose-300');
        expect(classes).toContain('min-h-14');
        expect(classes).toContain('w-full');
        expect(classes).toContain('cursor-wait');
    });
});
