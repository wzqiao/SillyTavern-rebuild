import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetConnectionSecretVaultForTest, setConnectionDraftApiKeySecret, useConnectionStore } from './connectionStore';

describe('useConnectionStore', () => {
    beforeEach(() => {
        resetConnectionSecretVaultForTest();
        setActivePinia(createPinia());
    });

    it('starts with an empty memory-only draft', () => {
        const store = useConnectionStore();

        expect(store.draft).toEqual({
            provider: 'openai-compatible',
            baseUrl: '',
            model: '',
            apiKey: {
                hasValue: false,
                maskedValue: '',
            },
        });
        expect(store.appliedDraft).toBeNull();
        expect(store.draftStatus).toBe('empty');
        expect(store.isDraftComplete).toBe(false);
        expect(store.hasAppliedDraft).toBe(false);
        expect(store.generationApi).toEqual({ api: 'openai' });
        expect(store.transportMode).toBe('auto');
    });

    it('patches and normalizes the draft without applying it', () => {
        const store = useConnectionStore();

        store.patchDraft({
            baseUrl: ' https://api.example.test/v1/ ',
            model: ' gpt-example ',
        });
        setConnectionDraftApiKeySecret(store, ' sk-test-123456 ');

        expect(store.draft).toEqual({
            provider: 'openai-compatible',
            baseUrl: 'https://api.example.test/v1',
            model: 'gpt-example',
            apiKey: {
                hasValue: true,
                maskedValue: 'sk-****3456',
            },
        });
        expect(store.draftStatus).toBe('complete');
        expect(store.appliedDraft).toBeNull();
        expect(store.maskedApiKey).toBe('sk-****3456');
        expect(JSON.stringify(store.$state)).not.toContain('sk-test-123456');
        expect(JSON.stringify({
            baseUrl: ' https://api.example.test/v1/ ',
            model: ' gpt-example ',
            apiKey: store.draft.apiKey,
        })).not.toContain('sk-test-123456');
    });

    it('reports validation errors for incomplete drafts', () => {
        const store = useConnectionStore();

        store.patchDraft({
            baseUrl: 'localhost:1234/v1',
            model: '',
        });

        expect(store.draftStatus).toBe('incomplete');
        expect(store.draftErrors).toEqual([
            {
                field: 'baseUrl',
                message: 'Base URL must start with http:// or https://.',
            },
            {
                field: 'model',
                message: 'Model id is required.',
            },
            {
                field: 'apiKey',
                message: 'API key is required before this draft can be applied.',
            },
        ]);
        expect(store.applyDraft()).toEqual({
            ok: false,
            issues: store.draftErrors,
            message: 'Base URL must start with http:// or https://.',
        });
        expect(store.appliedDraft).toBeNull();
    });

    it('applies a complete draft in memory only', () => {
        const store = useConnectionStore();
        store.patchDraft({
            baseUrl: 'https://api.example.test/v1',
            model: 'gpt-example',
        });
        setConnectionDraftApiKeySecret(store, 'sk-test-123456');

        expect(store.applyDraft('2026-06-09T00:00:00.000Z')).toEqual({
            ok: true,
            appliedDraft: {
                id: 'connection-draft-1',
                provider: 'openai-compatible',
                baseUrl: 'https://api.example.test/v1',
                model: 'gpt-example',
                apiKey: {
                    hasValue: true,
                    maskedValue: 'sk-****3456',
                },
                appliedAt: '2026-06-09T00:00:00.000Z',
            },
            message: 'Draft applied in memory only. It has not been connectivity-tested or persisted.',
        });
        expect(store.draftStatus).toBe('applied');
        expect(store.hasAppliedDraft).toBe(true);
        expect(JSON.stringify(store.$state)).not.toContain('sk-test-123456');
    });

    it('describes runtime handoff readiness without treating applied drafts as connected', () => {
        const store = useConnectionStore();
        store.setTransportMode('reforged-backend');

        expect(store.runtimeHandoff()).toMatchObject({
            status: 'empty',
            canAttempt: false,
            connection: null,
            takeRuntimeConnection: null,
            generation: { api: 'openai' },
            issues: [{
                code: 'draft-empty',
            }],
        });

        store.patchDraft({
            baseUrl: 'localhost:5000/v1',
            model: '',
        });
        expect(store.runtimeHandoff()).toMatchObject({
            status: 'incomplete',
            canAttempt: false,
            connection: null,
            takeRuntimeConnection: null,
            issues: [
                { code: 'draft-incomplete', field: 'baseUrl' },
                { code: 'draft-incomplete', field: 'model' },
                { code: 'draft-incomplete', field: 'apiKey' },
            ],
        });

        store.patchDraft({
            baseUrl: 'https://api.example.test/v1',
            model: 'gpt-example',
        });
        setConnectionDraftApiKeySecret(store, 'sk-test-123456');
        expect(store.runtimeHandoff()).toMatchObject({
            status: 'complete-unapplied',
            canAttempt: false,
            connection: null,
            takeRuntimeConnection: null,
            issues: [{
                code: 'draft-unapplied',
            }],
        });

        store.applyDraft('2026-06-09T00:00:00.000Z');
        expect(store.runtimeHandoff()).toMatchObject({
            status: 'applied-but-unwired',
            canAttempt: false,
            generation: { api: 'openai' },
            connection: {
                id: 'connection-draft-1',
                provider: 'openai-compatible',
                baseUrl: 'https://api.example.test/v1',
                model: 'gpt-example',
                apiKey: {
                    hasValue: true,
                    maskedValue: 'sk-****3456',
                },
                api: 'openai',
            },
            takeRuntimeConnection: null,
            issues: [{
                code: 'runtime-unwired',
            }],
        });

        expect(store.runtimeHandoff({ runtimeAdapterReady: true })).toMatchObject({
            status: 'applied-but-unwired',
            canAttempt: false,
            generation: { api: 'openai' },
            connection: {
                id: 'connection-draft-1',
                baseUrl: 'https://api.example.test/v1',
                model: 'gpt-example',
                api: 'openai',
            },
            takeRuntimeConnection: null,
            issues: [{
                code: 'runtime-connection-unwired',
            }],
        });

        const readyHandoff = store.runtimeHandoff({
            runtimeAdapterReady: true,
            runtimeDirectRequestReady: true,
        });
        expect(readyHandoff).toMatchObject({
            status: 'ready-to-attempt',
            canAttempt: true,
            generation: { api: 'openai' },
            connection: {
                id: 'connection-draft-1',
                baseUrl: 'https://api.example.test/v1',
                model: 'gpt-example',
                api: 'openai',
            },
            issues: [],
        });
        expect(typeof readyHandoff.takeRuntimeConnection).toBe('function');
        expect(JSON.stringify(readyHandoff)).not.toContain('sk-test-123456');
        expect(readyHandoff.takeRuntimeConnection?.()).toMatchObject({
            id: 'connection-draft-1',
            baseUrl: 'https://api.example.test/v1',
            model: 'gpt-example',
            api: 'openai',
            apiKey: 'sk-test-123456',
            transport: 'reforged-backend',
        });
        expect(readyHandoff.takeRuntimeConnection?.()).toBeNull();
        expect(JSON.stringify(store.runtimeHandoff({
            runtimeAdapterReady: true,
            runtimeDirectRequestReady: true,
        }).connection)).not.toContain('sk-test-123456');
    });

    it('updates transport mode and resets it with all connection state', () => {
        const store = useConnectionStore();

        store.setTransportMode('legacy-proxy');
        expect(store.transportMode).toBe('legacy-proxy');

        store.setTransportMode('reforged-backend');
        expect(store.transportMode).toBe('reforged-backend');

        store.clearAll();
        expect(store.transportMode).toBe('auto');
    });

    it('requires re-applying edited drafts before runtime handoff can be attempted again', () => {
        const store = useConnectionStore();
        store.patchDraft({
            baseUrl: 'https://api.example.test/v1',
            model: 'first-model',
        });
        setConnectionDraftApiKeySecret(store, 'sk-first-1234');
        store.applyDraft('2026-06-09T00:00:00.000Z');

        expect(store.runtimeHandoff({
            runtimeAdapterReady: true,
            runtimeDirectRequestReady: true,
        }).canAttempt).toBe(true);

        store.patchDraft({ model: 'edited-model' });

        expect(store.runtimeHandoff({
            runtimeAdapterReady: true,
            runtimeDirectRequestReady: true,
        })).toMatchObject({
            status: 'complete-unapplied',
            canAttempt: false,
            connection: null,
            issues: [{
                code: 'draft-unapplied',
            }],
        });
    });

    it('reuses the applied draft id until all state is cleared', () => {
        const store = useConnectionStore();
        store.patchDraft({
            baseUrl: 'https://api.example.test/v1',
            model: 'first-model',
        });
        setConnectionDraftApiKeySecret(store, 'sk-first-1234');
        store.applyDraft('2026-06-09T00:00:00.000Z');

        store.patchDraft({ model: 'second-model' });
        store.applyDraft('2026-06-09T00:01:00.000Z');

        expect(store.appliedDraft).toMatchObject({
            id: 'connection-draft-1',
            model: 'second-model',
            appliedAt: '2026-06-09T00:01:00.000Z',
        });

        store.clearAll();
        store.patchDraft({
            baseUrl: 'https://api.example.test/v1',
            model: 'new-profile',
        });
        setConnectionDraftApiKeySecret(store, 'sk-new-1234');
        store.applyDraft('2026-06-09T00:02:00.000Z');
        expect(store.appliedDraft?.id).toBe('connection-draft-2');
    });

    it('resets draft edits, clears the API key, and clears all memory state', () => {
        const store = useConnectionStore();
        store.patchDraft({
            baseUrl: 'https://api.example.test/v1',
            model: 'model-a',
        });
        setConnectionDraftApiKeySecret(store, 'sk-runtime-1234');
        store.applyDraft('2026-06-09T00:00:00.000Z');
        store.patchDraft({
            model: 'unsaved-change',
        });

        store.resetDraft();
        expect(store.draft).toEqual({
            provider: 'openai-compatible',
            baseUrl: 'https://api.example.test/v1',
            model: 'model-a',
            apiKey: {
                hasValue: true,
                maskedValue: 'sk-****1234',
            },
        });

        store.clearApiKey();
        expect(store.draft.apiKey).toEqual({
            hasValue: false,
            maskedValue: '',
        });
        expect(store.appliedDraft).toBeNull();
        expect(store.draftStatus).toBe('incomplete');
        expect(store.runtimeHandoff({
            runtimeAdapterReady: true,
            runtimeDirectRequestReady: true,
        })).toMatchObject({
            status: 'incomplete',
            canAttempt: false,
            connection: null,
            takeRuntimeConnection: null,
            issues: [{
                code: 'draft-incomplete',
                field: 'apiKey',
            }],
        });

        store.clearAll();
        expect(store.draft).toEqual({
            provider: 'openai-compatible',
            baseUrl: '',
            model: '',
            apiKey: {
                hasValue: false,
                maskedValue: '',
            },
        });
        expect(store.appliedDraft).toBeNull();
    });
});
