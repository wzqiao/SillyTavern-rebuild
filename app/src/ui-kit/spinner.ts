import type { ReforgedUiTone } from '@/contracts/ui';
import { cx } from './utils';

export type SpinnerSize = 'sm' | 'md' | 'lg';

const spinnerSizeClasses: Record<SpinnerSize, string> = {
    sm: 'h-4 w-4 border-2',
    md: 'h-5 w-5 border-2',
    lg: 'h-7 w-7 border-[3px]',
};

const spinnerToneClasses: Record<ReforgedUiTone, string> = {
    neutral: 'border-white/18 border-t-white',
    brand: 'border-cyan-100/20 border-t-cyan-200',
    success: 'border-emerald-100/20 border-t-emerald-200',
    warning: 'border-amber-100/20 border-t-amber-200',
    danger: 'border-rose-100/20 border-t-rose-200',
};

export function resolveSpinnerClasses(size: SpinnerSize = 'md', tone: ReforgedUiTone = 'neutral'): string {
    return cx(
        'inline-block animate-spin rounded-full',
        spinnerSizeClasses[size],
        spinnerToneClasses[tone],
    );
}
