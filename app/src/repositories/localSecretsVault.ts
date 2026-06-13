/**
 * 本机密钥通道(ADR-006 边界):API key 快照只落本机 localStorage,
 * 永远不经主持久化网关上传——即使主网关是 Reforged 后端。
 */

const SECRETS_STORAGE_KEY = 'st-reforged-connection-secrets';

export function loadLocalSecrets(): Record<string, string> | null {
    try {
        const raw = globalThis.localStorage?.getItem(SECRETS_STORAGE_KEY);

        if (!raw) {
            return null;
        }

        const parsed: unknown = JSON.parse(raw);

        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return null;
        }

        const secrets: Record<string, string> = {};
        for (const [slot, secret] of Object.entries(parsed)) {
            if (typeof secret === 'string' && secret.length > 0) {
                secrets[slot] = secret;
            }
        }

        return secrets;
    } catch {
        return null;
    }
}

export function saveLocalSecrets(secrets: Record<string, string>): void {
    try {
        globalThis.localStorage?.setItem(SECRETS_STORAGE_KEY, JSON.stringify(secrets));
    } catch {
        // 隐私模式/配额:静默放弃,密钥退化为内存级
    }
}

export function clearLocalSecrets(): void {
    try {
        globalThis.localStorage?.removeItem(SECRETS_STORAGE_KEY);
    } catch {
        // 同上
    }
}
