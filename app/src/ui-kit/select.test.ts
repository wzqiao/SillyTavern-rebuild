import { describe, expect, it } from 'vitest';
import { findSelectOption, hasEnabledOption } from './select';

const options = [
    { value: 'openai', label: 'OpenAI Compatible' },
    { value: 'demo', label: 'Demo', disabled: true },
] as const;

describe('select helpers', () => {
    it('finds a matching option by value', () => {
        expect(findSelectOption(options, 'openai')).toEqual(options[0]);
        expect(findSelectOption(options, 'missing')).toBeNull();
        expect(findSelectOption(options, '')).toBeNull();
    });

    it('detects whether an enabled option exists', () => {
        expect(hasEnabledOption(options)).toBe(true);
        expect(hasEnabledOption([{ value: 'demo', label: 'Demo', disabled: true }])).toBe(false);
    });
});
