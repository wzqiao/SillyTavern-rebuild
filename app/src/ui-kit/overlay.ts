import { panelSurfaceClass } from './tokens';
import { cx } from './utils';

export type ModalSize = 'sm' | 'md' | 'lg' | 'full';

export type DrawerPlacement = 'left' | 'right' | 'bottom';

export type DrawerSize = 'sm' | 'md' | 'lg' | 'full';

const modalSizeClasses: Record<ModalSize, string> = {
    sm: 'max-w-sm',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    full: 'max-w-5xl',
};

const sideDrawerSizeClasses: Record<Exclude<DrawerSize, 'full'>, string> = {
    sm: 'w-full max-w-xs',
    md: 'w-full max-w-sm',
    lg: 'w-full max-w-lg',
};

const bottomDrawerSizeClasses: Record<DrawerSize, string> = {
    sm: 'w-full max-h-[55dvh]',
    md: 'w-full max-h-[70dvh]',
    lg: 'w-full max-h-[82dvh]',
    full: 'w-full max-h-[96dvh]',
};

export const overlayBackdropClass = 'absolute inset-0 bg-neutral-950/82 backdrop-blur-sm';

export function resolveModalPanelClasses(size: ModalSize = 'md'): string {
    return cx(
        panelSurfaceClass,
        'relative w-full overflow-hidden',
        'max-h-[min(88dvh,56rem)]',
        modalSizeClasses[size],
    );
}

export function resolveDrawerShellClasses(placement: DrawerPlacement = 'bottom'): string {
    return cx(
        'fixed inset-0 z-[90] flex',
        placement === 'left' && 'justify-start',
        placement === 'right' && 'justify-end',
        placement === 'bottom' && 'items-end',
    );
}

export function resolveDrawerPanelClasses(
    placement: DrawerPlacement = 'bottom',
    size: DrawerSize = 'md',
): string {
    if (placement === 'bottom') {
        return cx(
            panelSurfaceClass,
            'w-full overflow-hidden rounded-b-none border-b-0',
            'px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3 sm:px-5',
            bottomDrawerSizeClasses[size],
        );
    }

    if (size === 'full') {
        return cx(
            panelSurfaceClass,
            'h-dvh w-full max-w-[100vw] rounded-none border-y-0',
            'px-4 py-4 sm:px-5 sm:py-5',
        );
    }

    return cx(
        panelSurfaceClass,
        'h-dvh rounded-none border-y-0',
        'px-4 py-4 sm:px-5 sm:py-5',
        sideDrawerSizeClasses[size],
    );
}
