import type { ReforgedTabItem } from '@/contracts/ui';
import { focusRingClass } from './tokens';
import { cx } from './utils';

export type TabsVariant = 'pill' | 'underline';

export type TabsSize = 'sm' | 'md';

export function getInitialTabId(
    items: readonly ReforgedTabItem[],
    requestedId?: string | null,
): string | null {
    if (requestedId && items.some((item) => item.id === requestedId && !item.disabled)) {
        return requestedId;
    }

    return items.find((item) => !item.disabled)?.id ?? null;
}

export function resolveTabsListClasses(variant: TabsVariant = 'pill', stretch = false): string {
    return cx(
        'flex w-full gap-2 overflow-x-auto pb-1',
        variant === 'pill'
            ? 'rounded-[1.4rem] border border-white/10 bg-white/5 p-1'
            : 'border-b border-white/10',
        stretch && 'flex-wrap sm:flex-nowrap',
    );
}

export function resolveTabTriggerClasses(
    active: boolean,
    variant: TabsVariant = 'pill',
    size: TabsSize = 'md',
    disabled = false,
): string {
    return cx(
        'inline-flex min-w-max items-center justify-center gap-2 whitespace-nowrap rounded-2xl px-4 font-medium tracking-[-0.01em] transition duration-200 ease-out',
        focusRingClass,
        size === 'sm' ? 'min-h-10 text-sm' : 'min-h-11 text-sm',
        variant === 'pill' && active && 'bg-cyan-300 text-neutral-950 shadow-[0_10px_28px_rgba(34,211,238,0.18)]',
        variant === 'pill' && !active && 'text-neutral-300 hover:bg-white/8 hover:text-neutral-50',
        variant === 'underline' && active && 'rounded-b-none border-b-2 border-cyan-300 text-cyan-100',
        variant === 'underline' && !active && 'rounded-b-none border-b-2 border-transparent text-neutral-400 hover:text-neutral-100',
        disabled && 'cursor-not-allowed opacity-45',
    );
}
