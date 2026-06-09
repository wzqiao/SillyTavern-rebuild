import { disabledClass, focusRingClass } from './tokens';
import { cx } from './utils';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

export type ButtonSize = 'sm' | 'md' | 'lg';

const buttonVariantClasses: Record<ButtonVariant, string> = {
    primary: 'border border-cyan-200/40 bg-cyan-300 text-neutral-950 hover:bg-cyan-200 active:bg-cyan-100',
    secondary: 'border border-white/12 bg-white/8 text-neutral-100 hover:bg-white/12 active:bg-white/16',
    outline: 'border border-white/12 bg-neutral-950/72 text-neutral-100 hover:border-cyan-300/40 hover:bg-white/6 active:bg-white/10',
    ghost: 'border border-transparent bg-transparent text-neutral-100 hover:bg-white/8 active:bg-white/10',
    danger: 'border border-rose-200/30 bg-rose-300 text-rose-950 hover:bg-rose-200 active:bg-rose-100',
};

const buttonSizeClasses: Record<ButtonSize, string> = {
    sm: 'min-h-10 rounded-xl px-3.5 text-sm',
    md: 'min-h-12 rounded-2xl px-4 text-sm',
    lg: 'min-h-14 rounded-[1.15rem] px-5 text-base',
};

export interface ResolveButtonClassOptions {
    variant?: ButtonVariant;
    size?: ButtonSize;
    block?: boolean;
    loading?: boolean;
}

export function resolveButtonClasses(options: ResolveButtonClassOptions = {}): string {
    const variant = options.variant ?? 'primary';
    const size = options.size ?? 'md';

    return cx(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium tracking-[-0.01em] transition duration-200 ease-out select-none',
        'shadow-[0_10px_30px_rgba(0,0,0,0.18)]',
        focusRingClass,
        disabledClass,
        buttonVariantClasses[variant],
        buttonSizeClasses[size],
        options.block && 'w-full',
        options.loading && 'cursor-wait',
    );
}
