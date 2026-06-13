import { describe, expect, it } from 'vitest';
import {
    DEFAULT_REFORGED_SERVER_URL,
    getDefaultReforgedServerUrl,
    normalizeReforgedHttpBaseUrl,
} from './reforgedRuntimeClient';

describe('reforgedRuntimeClient', () => {
    it('keeps localhost development on the explicit 8787 backend', () => {
        expect(getDefaultReforgedServerUrl({
            protocol: 'http:',
            hostname: 'localhost',
            origin: 'http://localhost:5173',
        })).toBe(DEFAULT_REFORGED_SERVER_URL);
        expect(getDefaultReforgedServerUrl({
            protocol: 'http:',
            hostname: '127.0.0.1',
            origin: 'http://127.0.0.1:5173',
        })).toBe(DEFAULT_REFORGED_SERVER_URL);
    });

    it('uses the current origin for public same-domain deployments', () => {
        expect(getDefaultReforgedServerUrl({
            protocol: 'https:',
            hostname: 'tavern.example.com',
            origin: 'https://tavern.example.com',
        })).toBe('https://tavern.example.com');
    });

    it('normalizes explicit configured URLs before using deployment defaults', () => {
        expect(normalizeReforgedHttpBaseUrl(' https://tavern.example.com/// ')).toBe('https://tavern.example.com');
    });
});
