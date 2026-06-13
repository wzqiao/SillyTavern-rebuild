export type ReforgedUiTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

export interface ReforgedSelectOption {
    value: string;
    label: string;
    description?: string;
    disabled?: boolean;
}

export interface ReforgedTabItem {
    id: string;
    label: string;
    badge?: string | number;
    disabled?: boolean;
}

export interface ReforgedToastItem {
    id: string;
    title: string;
    description?: string;
    tone?: ReforgedUiTone;
    actionLabel?: string;
    durationMs?: number;
}

export interface ReforgedListItemMeta {
    label: string;
    value: string;
    tone?: ReforgedUiTone;
}
