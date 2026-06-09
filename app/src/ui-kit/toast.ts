import type { ReforgedToastItem, ReforgedUiTone } from '@/contracts/ui';
import { focusRingClass } from './tokens';
import { cx } from './utils';

export type ToastPosition = 'top' | 'bottom';

export type ToastAlign = 'start' | 'center' | 'end';

const toastToneClasses: Record<ReforgedUiTone, string> = {
    neutral: 'border-white/10 bg-neutral-900/95 text-neutral-100',
    brand: 'border-cyan-400/20 bg-cyan-500/12 text-cyan-50',
    success: 'border-emerald-400/20 bg-emerald-500/12 text-emerald-50',
    warning: 'border-amber-400/20 bg-amber-500/14 text-amber-50',
    danger: 'border-rose-400/20 bg-rose-500/14 text-rose-50',
};

export function resolveToastStackClasses(
    position: ToastPosition = 'top',
    align: ToastAlign = 'center',
): string {
    return cx(
        'pointer-events-none fixed inset-x-0 z-[95] flex flex-col gap-3 px-3 sm:px-5',
        position === 'top' ? 'top-0 pt-[max(env(safe-area-inset-top),0.75rem)]' : 'bottom-0 pb-[max(env(safe-area-inset-bottom),0.75rem)]',
        align === 'start' && 'items-start',
        align === 'center' && 'items-center',
        align === 'end' && 'items-end',
    );
}

export function resolveToastClasses(tone: ReforgedUiTone = 'neutral'): string {
    return cx(
        'pointer-events-auto w-full max-w-sm rounded-[1.35rem] border p-4 shadow-[0_18px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl',
        toastToneClasses[tone],
    );
}

export function resolveToastActionClasses(): string {
    return cx(
        'inline-flex min-h-9 items-center justify-center rounded-xl px-3 text-sm font-medium transition duration-200 ease-out',
        'bg-white/10 text-inherit hover:bg-white/14',
        focusRingClass,
    );
}

export function resolveToastDuration(item: ReforgedToastItem, defaultDurationMs: number): number {
    return Math.max(item.durationMs ?? defaultDurationMs, 0);
}
