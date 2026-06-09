import type { ReforgedSelectOption } from '@/contracts/ui';

export function findSelectOption(
    options: readonly ReforgedSelectOption[],
    value: string | null | undefined,
): ReforgedSelectOption | null {
    if (!value) {
        return null;
    }

    return options.find((option) => option.value === value) ?? null;
}

export function hasEnabledOption(options: readonly ReforgedSelectOption[]): boolean {
    return options.some((option) => !option.disabled);
}
