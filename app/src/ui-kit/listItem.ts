import type { ReforgedUiTone } from '@/contracts/ui';
import { focusRingClass, insetSurfaceClass, resolveToneBadgeClass } from './tokens';
import { cx } from './utils';

const toneAccentClasses: Record<ReforgedUiTone, string> = {
    neutral: 'border-white/12',
    brand: 'border-amber-400/24',
    success: 'border-emerald-400/24',
    warning: 'border-amber-400/24',
    danger: 'border-rose-400/24',
};

export interface ResolveListItemClassOptions {
    interactive?: boolean;
    selected?: boolean;
    disabled?: boolean;
    tone?: ReforgedUiTone;
}

export function resolveListItemClasses(options: ResolveListItemClassOptions = {}): string {
    const tone = options.tone ?? 'neutral';

    return cx(
        insetSurfaceClass,
        'flex w-full items-start gap-3 px-4 py-3 text-left transition duration-200 ease-out',
        focusRingClass,
        toneAccentClasses[tone],
        options.interactive && 'hover:border-white/16 hover:bg-white/6 active:scale-[0.995]',
        options.selected && 'border-amber-300/34 bg-amber-400/10',
        options.disabled && 'cursor-not-allowed opacity-55',
    );
}

export function resolveListItemMetaClasses(tone: ReforgedUiTone = 'neutral'): string {
    return resolveToneBadgeClass(tone);
}
