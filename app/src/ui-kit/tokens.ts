import type { ReforgedUiTone } from '@/contracts/ui';
import { cx } from './utils';

export const focusRingClass =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950';

export const disabledClass = 'disabled:cursor-not-allowed disabled:opacity-55';

export const panelSurfaceClass =
    'rounded-[1.75rem] border border-white/10 bg-neutral-900/92 shadow-[0_24px_120px_rgba(0,0,0,0.46)] backdrop-blur-xl';

export const insetSurfaceClass =
    'rounded-[1.25rem] border border-white/8 bg-neutral-950/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]';

export const panelPaddingClass = 'px-4 py-4 sm:px-5 sm:py-5';

export const labelClass = 'block text-sm font-medium tracking-[-0.01em] text-neutral-100';

export const supportingTextClass = 'text-xs leading-5 text-neutral-400';

const toneTextMap: Record<ReforgedUiTone, string> = {
    neutral: 'text-neutral-100',
    brand: 'text-cyan-100',
    success: 'text-emerald-100',
    warning: 'text-amber-100',
    danger: 'text-rose-100',
};

const toneBadgeMap: Record<ReforgedUiTone, string> = {
    neutral: 'border-white/10 bg-white/6 text-neutral-200',
    brand: 'border-cyan-400/20 bg-cyan-400/12 text-cyan-100',
    success: 'border-emerald-400/20 bg-emerald-400/12 text-emerald-100',
    warning: 'border-amber-400/20 bg-amber-400/12 text-amber-100',
    danger: 'border-rose-400/20 bg-rose-400/12 text-rose-100',
};

const toneSoftMap: Record<ReforgedUiTone, string> = {
    neutral: 'border-white/10 bg-white/5 text-neutral-100',
    brand: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-50',
    success: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-50',
    warning: 'border-amber-400/20 bg-amber-400/12 text-amber-50',
    danger: 'border-rose-400/20 bg-rose-400/12 text-rose-50',
};

const toneSolidMap: Record<ReforgedUiTone, string> = {
    neutral: 'border-white/12 bg-neutral-100 text-neutral-950',
    brand: 'border-cyan-200/40 bg-cyan-300 text-neutral-950',
    success: 'border-emerald-200/40 bg-emerald-300 text-emerald-950',
    warning: 'border-amber-200/40 bg-amber-300 text-amber-950',
    danger: 'border-rose-200/40 bg-rose-300 text-rose-950',
};

export function resolveToneTextClass(tone: ReforgedUiTone = 'neutral'): string {
    return toneTextMap[tone];
}

export function resolveToneBadgeClass(tone: ReforgedUiTone = 'neutral'): string {
    return cx('inline-flex items-center rounded-full border px-2.5 py-1 text-[0.6875rem] font-medium', toneBadgeMap[tone]);
}

export function resolveToneSurfaceClass(
    tone: ReforgedUiTone = 'neutral',
    emphasis: 'soft' | 'solid' = 'soft',
): string {
    return emphasis === 'solid' ? toneSolidMap[tone] : toneSoftMap[tone];
}
