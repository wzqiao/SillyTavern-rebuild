import { describe, expect, it } from 'vitest';
import { clampNumber, createDescribedBy, createUiId, cx } from './utils';

describe('ui-kit utils', () => {
    it('builds class names from nested values', () => {
        expect(cx(
            'base',
            ['nested', null, ['deep']],
            { enabled: true, disabled: false },
            undefined,
            false,
        )).toBe('base nested deep enabled');
    });

    it('creates aria-describedby tokens only when ids are present', () => {
        expect(createDescribedBy(undefined, null, false, 'field-hint', 'field-error')).toBe('field-hint field-error');
        expect(createDescribedBy(undefined, null, false)).toBeUndefined();
    });

    it('clamps a number into the provided range', () => {
        expect(clampNumber(-3, 0, 10)).toBe(0);
        expect(clampNumber(6, 0, 10)).toBe(6);
        expect(clampNumber(15, 0, 10)).toBe(10);
    });

    it('creates stable prefixed ids', () => {
        const first = createUiId('test');
        const second = createUiId('test');

        expect(first).toMatch(/^test-\d+$/);
        expect(second).toMatch(/^test-\d+$/);
        expect(first).not.toBe(second);
    });
});
