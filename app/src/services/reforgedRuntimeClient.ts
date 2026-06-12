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

const SERVER_URL_STORAGE_KEY = 'st-reforged-server-url';
const SERVER_TOKEN_STORAGE_KEY = 'st-reforged-server-token';

export function readConfiguredReforgedServerUrl(): string | null {
    return readLocalValue(SERVER_URL_STORAGE_KEY);
}

export function writeConfiguredReforgedServerUrl(value: string): void {
    writeLocalValue(SERVER_URL_STORAGE_KEY, value);
}

export function readConfiguredReforgedServerToken(): string | null {
    return readLocalValue(SERVER_TOKEN_STORAGE_KEY);
}

export function writeConfiguredReforgedServerToken(value: string): void {
    writeLocalValue(SERVER_TOKEN_STORAGE_KEY, value);
}

/** 配置了服务口令时,所有 Reforged 后端请求带 X-Reforged-Token。 */
export function reforgedAuthHeaders(): Record<string, string> {
    const token = readConfiguredReforgedServerToken();
    return token ? { 'X-Reforged-Token': token } : {};
}

/** WebSocket 无自定义头,token 走 query 参数。 */
export function appendReforgedTokenQuery(url: string): string {
    const token = readConfiguredReforgedServerToken();
    if (!token) {
        return url;
    }
    return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}

function readLocalValue(key: string): string | null {
    try {
        const value = globalThis.localStorage?.getItem(key);
        return value && value.trim() ? value.trim() : null;
    } catch {
        return null;
    }
}

function writeLocalValue(key: string, value: string): void {
    try {
        if (value.trim()) {
            globalThis.localStorage?.setItem(key, value.trim());
        } else {
            globalThis.localStorage?.removeItem(key);
        }
    } catch {
        // 隐私模式:忽略
    }
}
