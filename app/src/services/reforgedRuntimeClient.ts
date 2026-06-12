// DRAFT: 待主干评审

export interface ReforgedRuntimeClientOptions {
    baseUrl?: string;
    fetch?: typeof fetch;
}

export const DEFAULT_REFORGED_SERVER_URL = 'http://127.0.0.1:8787';

export function normalizeReforgedHttpBaseUrl(value: string | undefined): string {
    const trimmed = value?.trim().replace(/\/+$/g, '') ?? '';
    return trimmed || DEFAULT_REFORGED_SERVER_URL;
}
