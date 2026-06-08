import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useConnectionStore } from './connectionStore';

describe('useConnectionStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('starts with an empty memory-only draft', () => {
        const store = useConnectionStore();

        expect(store.draft).toEqual({
            provider: 'openai-compatible',
            baseUrl: '',
            model: '',
            apiKey: '',
        });
        expect(store.appliedDraft).toBeNull();
        expect(store.draftStatus).toBe('empty');
        expect(store.isDraftComplete).toBe(false);
        expect(store.hasAppliedDraft).toBe(false);
        expect(store.generationApi).toEqual({ api: 'openai' });
    });

    it('patches and normalizes the draft without applying it', () => {
        const store = useConnectionStore();

        store.patchDraft({
            baseUrl: ' https://api.example.test/v1/ ',
            model: ' gpt-example ',
            apiKey: ' sk-test-123456 ',
        });

        expect(store.draft).toEqual({
            provider: 'openai-compatible',
            baseUrl: 'https://api.example.test/v1',
            model: 'gpt-example',
            apiKey: 'sk-test-123456',
        });
        expect(store.draftStatus).toBe('complete');
        expect(store.appliedDraft).toBeNull();
        expect(store.maskedApiKey).toBe('sk-****3456');
    });

    it('reports validation errors for incomplete drafts', () => {
        const store = useConnectionStore();

        store.patchDraft({
            baseUrl: 'localhost:1234/v1',
            model: '',
            apiKey: '',
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
            apiKey: 'sk-test-123456',
        });

        expect(store.applyDraft('2026-06-09T00:00:00.000Z')).toEqual({
            ok: true,
            appliedDraft: {
                id: 'connection-draft-1',
                provider: 'openai-compatible',
                baseUrl: 'https://api.example.test/v1',
                model: 'gpt-example',
                apiKey: 'sk-test-123456',
                appliedAt: '2026-06-09T00:00:00.000Z',
            },
            message: 'Draft applied in memory only. It has not been connectivity-tested or persisted.',
        });
        expect(store.draftStatus).toBe('applied');
        expect(store.hasAppliedDraft).toBe(true);
    });

    it('reuses the applied draft id until all state is cleared', () => {
        const store = useConnectionStore();
        store.patchDraft({
            baseUrl: 'https://api.example.test/v1',
            model: 'first-model',
            apiKey: 'sk-first-1234',
        });
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
            apiKey: 'sk-new-1234',
        });
        store.applyDraft('2026-06-09T00:02:00.000Z');
        expect(store.appliedDraft?.id).toBe('connection-draft-2');
    });

    it('resets draft edits, clears the API key, and clears all memory state', () => {
        const store = useConnectionStore();
        store.patchDraft({
            baseUrl: 'https://api.example.test/v1',
            model: 'model-a',
            apiKey: 'sk-runtime-1234',
        });
        store.applyDraft('2026-06-09T00:00:00.000Z');
        store.patchDraft({
            model: 'unsaved-change',
        });

        store.resetDraft();
        expect(store.draft).toEqual({
            provider: 'openai-compatible',
            baseUrl: 'https://api.example.test/v1',
            model: 'model-a',
            apiKey: 'sk-runtime-1234',
        });

        store.clearApiKey();
        expect(store.draft.apiKey).toBe('');
        expect(store.draftStatus).toBe('incomplete');

        store.clearAll();
        expect(store.draft).toEqual({
            provider: 'openai-compatible',
            baseUrl: '',
            model: '',
            apiKey: '',
        });
        expect(store.appliedDraft).toBeNull();
    });
});
