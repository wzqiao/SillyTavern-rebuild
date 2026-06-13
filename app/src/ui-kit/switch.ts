import type { ReforgedUiTone } from '@/contracts/ui';
import { focusRingClass } from './tokens';
import { cx } from './utils';

const switchTrackToneClasses: Record<ReforgedUiTone, string> = {
    neutral: 'data-[checked=true]:bg-white/22',
    brand: 'data-[checked=true]:bg-amber-300/70',
    success: 'data-[checked=true]:bg-emerald-300/70',
    warning: 'data-[checked=true]:bg-amber-300/70',
    danger: 'data-[checked=true]:bg-rose-300/70',
};

const switchShellToneClasses: Record<ReforgedUiTone, string> = {
    neutral: 'border-white/10 bg-white/4',
    brand: 'border-amber-400/18 bg-amber-400/6',
    success: 'border-emerald-400/18 bg-emerald-400/6',
    warning: 'border-amber-400/18 bg-amber-400/8',
    danger: 'border-rose-400/18 bg-rose-400/8',
};

export function resolveSwitchShellClasses(tone: ReforgedUiTone = 'neutral', disabled = false): string {
    return cx(
        'flex items-start justify-between gap-3 rounded-[1.35rem] border px-4 py-3',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]',
        switchShellToneClasses[tone],
        disabled && 'cursor-not-allowed opacity-55',
    );
}

export function resolveSwitchTrackClasses(tone: ReforgedUiTone = 'brand', disabled = false): string {
    return cx(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-white/12 bg-neutral-800/95 p-0.5 transition duration-200 ease-out',
        'data-[checked=false]:bg-neutral-800/95',
        switchTrackToneClasses[tone],
        focusRingClass,
        disabled && 'cursor-not-allowed opacity-70',
    );
}

export function resolveSwitchThumbClasses(checked: boolean): string {
    return cx(
        'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-[0_6px_14px_rgba(0,0,0,0.28)] transition duration-200 ease-out',
        checked ? 'translate-x-5' : 'translate-x-0',
    );
}
