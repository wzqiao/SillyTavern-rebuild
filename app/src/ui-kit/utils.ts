export type UiClassValue =
    | string
    | null
    | undefined
    | false
    | UiClassValue[]
    | Record<string, boolean | null | undefined>;

export function cx(...values: UiClassValue[]): string {
    const classes: string[] = [];

    for (const value of values) {
        if (!value) {
            continue;
        }

        if (typeof value === 'string') {
            classes.push(value);
            continue;
        }

        if (Array.isArray(value)) {
            const nested = cx(...value);

            if (nested) {
                classes.push(nested);
            }

            continue;
        }

        for (const [className, enabled] of Object.entries(value)) {
            if (enabled) {
                classes.push(className);
            }
        }
    }

    return classes.join(' ').trim();
}

export function createDescribedBy(...ids: Array<string | null | undefined | false>): string | undefined {
    const tokens = ids.filter((value): value is string => Boolean(value));

    return tokens.length > 0 ? tokens.join(' ') : undefined;
}

export function clampNumber(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

let uiIdCounter = 0;

export function createUiId(prefix = 'reforged-ui'): string {
    uiIdCounter += 1;
    return `${prefix}-${uiIdCounter}`;
}

export function isBrowserEnvironment(): boolean {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
}
