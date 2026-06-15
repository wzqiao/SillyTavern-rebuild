import type { ReforgedUiTone } from '@/contracts/ui';
import { disabledClass, focusRingClass, labelClass, supportingTextClass } from './tokens';
import { cx } from './utils';

export type FieldTone = ReforgedUiTone;

const fieldToneClasses: Record<FieldTone, string> = {
    neutral: 'border-white/10 bg-neutral-950/72 text-neutral-100 placeholder:text-neutral-500 hover:border-white/16 focus:border-amber-300/45',
    brand: 'border-amber-400/20 bg-amber-400/8 text-amber-50 placeholder:text-amber-200/35 hover:border-amber-300/32 focus:border-amber-200/55',
    success: 'border-emerald-400/20 bg-emerald-400/8 text-emerald-50 placeholder:text-emerald-200/35 hover:border-emerald-300/32 focus:border-emerald-200/55',
    warning: 'border-amber-400/20 bg-amber-400/10 text-amber-50 placeholder:text-amber-200/40 hover:border-amber-300/32 focus:border-amber-200/55',
    danger: 'border-rose-400/24 bg-rose-400/10 text-rose-50 placeholder:text-rose-200/38 hover:border-rose-300/34 focus:border-rose-200/55',
};

export const fieldShellClass = 'space-y-2';
export const fieldLabelClass = labelClass;
export const fieldHintClass = supportingTextClass;

export interface ResolveFieldClassOptions {
    tone?: FieldTone;
    disabled?: boolean;
    multiline?: boolean;
    hasLeading?: boolean;
    hasTrailing?: boolean;
}

export function resolveFieldClasses(options: ResolveFieldClassOptions = {}): string {
    const tone = options.tone ?? 'neutral';

    return cx(
        'w-full border text-sm transition duration-200 ease-out',
        'min-h-12 rounded-[1.25rem] px-4 py-3',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]',
        focusRingClass,
        disabledClass,
        fieldToneClasses[tone],
        options.multiline ? 'min-h-[8rem] resize-y leading-6' : 'leading-6',
        options.hasLeading && 'pl-11',
        options.hasTrailing && 'pr-11',
        options.disabled && 'cursor-not-allowed opacity-60',
    );
}

export function resolveFieldHintClass(tone: FieldTone = 'neutral'): string {
    if (tone === 'neutral') {
        return fieldHintClass;
    }

    const toneHintClass: Record<Exclude<FieldTone, 'neutral'>, string> = {
        brand: 'text-amber-200/82',
        success: 'text-emerald-200/82',
        warning: 'text-amber-200/82',
        danger: 'text-rose-200/82',
    };

    return cx('text-xs leading-5', toneHintClass[tone]);
}
