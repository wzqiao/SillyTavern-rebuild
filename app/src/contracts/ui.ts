// DRAFT: 待主干评审

export type ReforgedUiTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

// DRAFT: 待主干评审
export interface ReforgedSelectOption {
    value: string;
    label: string;
    description?: string;
    disabled?: boolean;
}

// DRAFT: 待主干评审
export interface ReforgedTabItem {
    id: string;
    label: string;
    badge?: string | number;
    disabled?: boolean;
}

// DRAFT: 待主干评审
export interface ReforgedToastItem {
    id: string;
    title: string;
    description?: string;
    tone?: ReforgedUiTone;
    actionLabel?: string;
    durationMs?: number;
}

// DRAFT: 待主干评审
export interface ReforgedListItemMeta {
    label: string;
    value: string;
    tone?: ReforgedUiTone;
}
