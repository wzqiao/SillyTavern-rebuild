import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
    ParticipantKeySubmitRequest,
    RoomJoinResult,
    RoomSnapshot,
} from '@/contracts/multiplayer';
import type {
    ReforgedMultiplayerClient,
    ReforgedRoomSocketConnection,
} from '@/services';
import {
    resetMultiplayerSecretVaultForTest,
    setMultiplayerClientFactoryForTest,
    setMultiplayerProviderKeySecret,
    useMultiplayerStore,
} from './multiplayerStore';

describe('useMultiplayerStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        setMultiplayerClientFactoryForTest(null);
        resetMultiplayerSecretVaultForTest();
    });

    it('joins a room and applies server-authoritative chat events', async () => {
        const socket = createSocketStub();
        setMultiplayerClientFactoryForTest(() => createClientStub({
            socket,
            joinResult: createJoinResult(),
        }));

        const store = useMultiplayerStore();
        await store.createRoom({
            nickname: 'Alice',
            password: 'room-pass',
        });

        expect(store.isConnected).toBe(true);
        expect(store.room?.id).toBe('room-1');
        expect(store.participantId).toBe('participant-a');

        store.applyServerPayload({
            type: 'room.event',
            event: {
                id: 'event-2',
                type: 'chat.appended',
                roomId: 'room-1',
                actorId: 'participant-a',
                seq: 2,
                revision: 2,
                createdAt: '2026-06-12T00:00:01.000Z',
                message: {
                    id: 'message-1',
                    role: 'user',
                    content: 'Hello table.',
                    authorId: 'participant-a',
                    status: 'sent',
                    createdAt: '2026-06-12T00:00:01.000Z',
                    seq: 2,
                    revision: 2,
                    alternatives: [],
                },
            },
        });

        expect(store.chatMessages).toMatchObject([{
            id: 'message-1',
            sessionId: 'room-1',
            role: 'user',
            content: 'Hello table.',
            authorId: 'participant-a',
            seq: 2,
        }]);
    });

    it('keeps raw provider keys out of Pinia state while submitting them through the transient vault', async () => {
        const submitKey = vi.fn<ReforgedMultiplayerClient['submitParticipantKey']>(async (input) => ({
            roomId: input.roomId,
            participantId: input.participantId,
            keyState: {
                keyRef: 'keyref-participant-a',
                ownerParticipantId: input.participantId,
                provider: input.provider.api,
                baseUrl: input.provider.baseUrl,
                model: input.provider.model,
                hasKey: true,
                maskedLabel: 'sk-****1234',
                updatedAt: '2026-06-12T00:00:02.000Z',
            },
        }));
        setMultiplayerClientFactoryForTest(() => createClientStub({
            socket: createSocketStub(),
            joinResult: createJoinResult(),
            submitKey,
        }));

        const store = useMultiplayerStore();
        await store.createRoom({
            nickname: 'Alice',
            password: 'room-pass',
        });
        setMultiplayerProviderKeySecret('sk-secret-1234');
        await store.submitProviderKey({
            api: 'openai',
            baseUrl: 'https://api.example.test/v1',
            model: 'gpt-example',
        });

        expect(submitKey).toHaveBeenCalledWith(expect.objectContaining({
            apiKey: 'sk-secret-1234',
            provider: {
                api: 'openai',
                baseUrl: 'https://api.example.test/v1',
                model: 'gpt-example',
            },
        } satisfies Partial<ParticipantKeySubmitRequest>));
        expect(store.canGenerate).toBe(true);
        expect(JSON.stringify(store.$state)).not.toContain('sk-secret-1234');
        expect(JSON.stringify(store.$state)).not.toContain('apiKey');
    });

    it('uses only public key refs when requesting generation', async () => {
        const socket = createSocketStub();
        setMultiplayerClientFactoryForTest(() => createClientStub({
            socket,
            joinResult: createJoinResult({
                participants: [{
                    id: 'participant-a',
                    nickname: 'Alice',
                    role: 'host',
                    presence: 'online',
                    joinedAt: '2026-06-12T00:00:00.000Z',
                    canGenerate: true,
                    keyState: {
                        keyRef: 'keyref-participant-a',
                        ownerParticipantId: 'participant-a',
                        provider: 'openai',
                        baseUrl: 'https://api.example.test/v1',
                        model: 'gpt-example',
                        hasKey: true,
                        maskedLabel: 'sk-****1234',
                        updatedAt: '2026-06-12T00:00:02.000Z',
                    },
                }],
            }),
        }));

        const store = useMultiplayerStore();
        await store.createRoom({
            nickname: 'Alice',
            password: 'room-pass',
        });
        store.requestGeneration();

        const payload = socket.sentPayloads.at(-1);
        expect(payload).toMatchObject({
            type: 'generation.request',
            request: {
                roomId: 'room-1',
                triggerParticipantId: 'participant-a',
                provider: {
                    keyRef: 'keyref-participant-a',
                    model: 'gpt-example',
                },
            },
        });
        expect(JSON.stringify(payload)).not.toContain('sk-secret');
        expect(JSON.stringify(payload)).not.toContain('apiKey');
    });
});

function createSocketStub(): ReforgedRoomSocketConnection & { sentPayloads: unknown[] } {
    const sentPayloads: unknown[] = [];
    return {
        sentPayloads,
        send(payload) {
            sentPayloads.push(payload);
        },
        close: vi.fn(),
    };
}

function createClientStub(options: {
    socket: ReforgedRoomSocketConnection;
    joinResult: RoomJoinResult;
    submitKey?: ReforgedMultiplayerClient['submitParticipantKey'];
}): ReforgedMultiplayerClient {
    return {
        createRoom: vi.fn(async () => options.joinResult),
        joinRoom: vi.fn(async () => options.joinResult),
        submitParticipantKey: options.submitKey ?? vi.fn(),
        appendChat: vi.fn(),
        cancelGeneration: vi.fn(),
        openRoomSocket: vi.fn((input) => {
            input.handlers.onOpen?.();
            input.handlers.onPayload({
                type: 'room.snapshot',
                snapshot: options.joinResult.snapshot,
            });
            return options.socket;
        }),
    };
}

function createJoinResult(overrides: Partial<RoomSnapshot> = {}): RoomJoinResult {
    return {
        roomId: 'room-1',
        participantId: 'participant-a',
        resumeToken: 'resume-token-a',
        snapshot: {
            room: {
                id: 'room-1',
                title: 'Test room',
                accessMode: 'password',
                link: {
                    roomId: 'room-1',
                    inviteCode: 'invite-1',
                    url: 'http://localhost:5173/#/chat?room=room-1',
                },
                createdAt: '2026-06-12T00:00:00.000Z',
                updatedAt: '2026-06-12T00:00:00.000Z',
                createdBy: 'participant-a',
            },
            participants: [{
                id: 'participant-a',
                nickname: 'Alice',
                role: 'host',
                presence: 'online',
                joinedAt: '2026-06-12T00:00:00.000Z',
                canGenerate: true,
            }],
            messages: [],
            activeGenerations: [],
            latestSeq: 1,
            revision: 1,
            serverTime: '2026-06-12T00:00:00.000Z',
            ...overrides,
        },
    };
}
