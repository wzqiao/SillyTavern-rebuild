import type { ReforgedUiTone } from '@/contracts/ui';
import { focusRingClass, insetSurfaceClass, resolveToneTextClass } from './tokens';
import { cx } from './utils';

export function resolveCollapseRootClasses(disabled = false): string {
    return cx(
        insetSurfaceClass,
        'overflow-hidden',
        disabled && 'opacity-60',
    );
}

export function resolveCollapseTriggerClasses(
    tone: ReforgedUiTone = 'neutral',
    open = false,
    disabled = false,
): string {
    return cx(
        'flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition duration-200 ease-out',
        focusRingClass,
        resolveToneTextClass(tone),
        open ? 'bg-white/5' : 'hover:bg-white/4',
        disabled && 'cursor-not-allowed opacity-60',
    );
}

export function resolveCollapsePanelClasses(open: boolean): string {
    return cx(
        'grid transition-[grid-template-rows,opacity] duration-200 ease-out',
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-70',
    );
}

export function resolveCollapseIconClasses(open: boolean): string {
    return cx(
        'shrink-0 transition duration-200 ease-out',
        open ? 'rotate-180 text-cyan-200' : 'rotate-0 text-neutral-400',
    );
}
