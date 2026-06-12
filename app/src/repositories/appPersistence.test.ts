import { describe, expect, it } from 'vitest';
import { createPinia } from 'pinia';
import { createAppPersistenceController } from './appPersistence';
import { createMemoryPersistenceGateway } from './memoryRepository';
import {
    setConnectionDraftApiKeySecret,
    useCharacterStore,
    useChatStore,
    useConnectionStore,
    usePresetStore,
    useWorldbookStore,
} from '@/stores';
import { resetConnectionSecretVaultForTest } from '@/stores/connectionStore';

describe('app persistence round trip', () => {
    it('restores all domain stores in a fresh pinia from the same gateway', async () => {
        const gateway = createMemoryPersistenceGateway();

        // ---- 第一个应用生命周期:写入数据 ----
        const piniaA = createPinia();
        const controllerA = await createAppPersistenceController(piniaA, gateway, { debounceMs: 0 });

        const chatA = useChatStore(piniaA);
        const characterA = useCharacterStore(piniaA);
        const worldbookA = useWorldbookStore(piniaA);
        const connectionA = useConnectionStore(piniaA);

        const session = chatA.startSession({
            character: { id: 'char-1', name: '吞噬星空', firstMessage: '你好,旅者。' },
        });

        characterA.$patch({
            characters: [{
                id: 'char-1',
                card: { name: '吞噬星空' },
                source: { fileName: 'test.png', format: 'png' },
                importedAt: '2026-06-12T00:00:00.000Z',
                warnings: [],
            }] as never[],
            selectedCharacterId: 'char-1',
            nextLocalId: 2,
        });

        worldbookA.$patch({
            worldbooks: [{
                id: 'wb-1',
                worldbook: { name: '测试世界书', entries: [] },
                source: { fileName: 'wb.json' },
                importedAt: '2026-06-12T00:00:00.000Z',
                warnings: [],
            }] as never[],
            selectedWorldbookId: 'wb-1',
            nextLocalId: 2,
        });

        connectionA.patchDraft({ baseUrl: 'https://api.example.com/v1', model: 'demo-model' });
        setConnectionDraftApiKeySecret(connectionA, 'sk-test-secret');
        connectionA.setTransportMode('reforged-backend');
        const applyResult = connectionA.applyDraft();
        expect(applyResult.ok).toBe(true);

        const presetA = usePresetStore(piniaA);
        const presetImport = presetA.importPreset({
            fileName: 'test-preset.json',
            text: JSON.stringify({ temperature: 0.7, prompts: [], prompt_order: [] }),
        });
        expect(presetImport.ok).toBe(true);

        await controllerA.flush();
        controllerA.stop();

        // ---- 第二个应用生命周期:全新 pinia,从同一网关水合 ----
        resetConnectionSecretVaultForTest();
        const piniaB = createPinia();
        const controllerB = await createAppPersistenceController(piniaB, gateway, { debounceMs: 0 });

        const chatB = useChatStore(piniaB);
        const characterB = useCharacterStore(piniaB);
        const worldbookB = useWorldbookStore(piniaB);
        const connectionB = useConnectionStore(piniaB);

        expect(chatB.sessions).toHaveLength(1);
        expect(chatB.sessions[0].id).toBe(session.id);
        expect(chatB.sessions[0].participants).toEqual(['local-user']);
        expect(chatB.selectedSessionId).toBe(session.id);
        expect(chatB.messages).toHaveLength(1);
        expect(chatB.messages[0].content).toBe('你好,旅者。');
        expect(chatB.messages[0].authorId).toBe('local-character');
        expect(chatB.nextSessionLocalId).toBe(chatA.nextSessionLocalId);
        expect(chatB.nextMessageLocalId).toBe(chatA.nextMessageLocalId);

        expect(characterB.characters).toHaveLength(1);
        expect(characterB.selectedCharacterId).toBe('char-1');

        expect(worldbookB.worldbooks).toHaveLength(1);
        expect(worldbookB.selectedWorldbookId).toBe('wb-1');

        expect(connectionB.draft.baseUrl).toBe('https://api.example.com/v1');
        expect(connectionB.appliedDraft).not.toBeNull();
        expect(connectionB.appliedDraft?.apiKey.hasValue).toBe(true);
        expect(connectionB.transportMode).toBe('reforged-backend');
        const handoff = connectionB.runtimeHandoff({
            runtimeAdapterReady: true,
            runtimeDirectRequestReady: true,
        });
        expect(handoff.takeRuntimeConnection?.()).toMatchObject({
            apiKey: 'sk-test-secret',
            transport: 'reforged-backend',
        });

        const presetB = usePresetStore(piniaB);
        expect(presetB.presets).toHaveLength(1);
        expect(presetB.selectedPreset?.preset.sampling.temperature).toBe(0.7);

        controllerB.stop();
    });

    it('marks generating messages as failed after hydration', async () => {
        const gateway = createMemoryPersistenceGateway();

        const piniaA = createPinia();
        const controllerA = await createAppPersistenceController(piniaA, gateway, { debounceMs: 0 });
        const chatA = useChatStore(piniaA);

        const session = chatA.startSession({ title: '中断测试' });
        const pending = chatA.createMessage(session.id, 'assistant', '', '2026-06-12T00:00:00.000Z', 'generating');
        session.messageIds.push(pending.id);
        chatA.messages.push(pending);

        await controllerA.flush();
        controllerA.stop();

        const piniaB = createPinia();
        const controllerB = await createAppPersistenceController(piniaB, gateway, { debounceMs: 0 });
        const chatB = useChatStore(piniaB);

        expect(chatB.messages).toHaveLength(1);
        expect(chatB.messages[0].status).toBe('failed');
        expect(chatB.messages[0].error?.code).toBe('generation-cancelled');

        controllerB.stop();
    });

    it('bumps envelope revisions when entities change', async () => {
        const gateway = createMemoryPersistenceGateway();
        const pinia = createPinia();
        const controller = await createAppPersistenceController(pinia, gateway, { debounceMs: 0 });
        const chat = useChatStore(pinia);

        const session = chat.startSession({ title: '版本测试' });
        await controller.flush();

        let envelopes = await gateway.chatSessions.list();
        expect(envelopes.find((envelope) => envelope.id === session.id)?.revision).toBe(1);

        const storedSession = chat.sessions.find((item) => item.id === session.id);
        if (storedSession) {
            storedSession.title = '改名';
            storedSession.updatedAt = '2026-06-12T01:00:00.000Z';
        }
        await controller.flush();

        envelopes = await gateway.chatSessions.list();
        expect(envelopes.find((envelope) => envelope.id === session.id)?.revision).toBe(2);

        controller.stop();
    });
});
