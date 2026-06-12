import { defineStore } from 'pinia';
import { markRaw } from 'vue';
import type { ReforgedChatMessage } from '@/contracts/chat';
import type {
    GenerationRequest,
    GenerationRequestId,
    GenerationStatus,
    ParticipantId,
    ParticipantKeyState,
    ParticipantPublicProfile,
    RoomChatMessage,
    RoomClientPayload,
    RoomEvent,
    RoomId,
    RoomJoinRequest,
    RoomJoinResult,
    RoomMessageId,
    RoomMetadata,
    RoomPublicError,
    RoomServerPayload,
    RoomSnapshot,
} from '@/contracts/multiplayer';
import type { ReforgedGenerationApi } from '@/contracts/engine';
import {
    createMultiplayerClient,
    normalizeHttpBaseUrl,
    type ReforgedMultiplayerClient,
    type ReforgedMultiplayerClientOptions,
    type ReforgedRoomSocketConnection,
} from '@/services/multiplayerClient';

type MultiplayerStatus = 'idle' | 'connecting' | 'connected' | 'error';

interface MultiplayerStoreState {
    serverUrl: string;
    status: MultiplayerStatus;
    socketConnected: boolean;
    room: RoomMetadata | null;
    participantId: ParticipantId | null;
    resumeToken: string | null;
    participants: ParticipantPublicProfile[];
    messages: RoomChatMessage[];
    activeGenerations: GenerationStatus[];
    latestSeq: number;
    revision: number;
    lastError: RoomPublicError | null;
    keyState: ParticipantKeyState | null;
    nextGenerationLocalId: number;
}

type MultiplayerClientFactory = (options?: ReforgedMultiplayerClientOptions) => ReforgedMultiplayerClient;

let multiplayerClientFactory: MultiplayerClientFactory = createMultiplayerClient;
let activeClient: ReforgedMultiplayerClient | null = null;
let activeSocket: ReforgedRoomSocketConnection | null = null;
let pendingProviderKeySecret: string | null = null;

export const useMultiplayerStore = defineStore('multiplayer', {
    state: (): MultiplayerStoreState => ({
        serverUrl: 'http://127.0.0.1:8787',
        status: 'idle',
        socketConnected: false,
        room: null,
        participantId: null,
        resumeToken: null,
        participants: [],
        messages: [],
        activeGenerations: [],
        latestSeq: 0,
        revision: 0,
        lastError: null,
        keyState: null,
        nextGenerationLocalId: 1,
    }),

    getters: {
        isConnected(state): boolean {
            return state.status === 'connected' && Boolean(state.room && state.participantId);
        },

        canGenerate(state): boolean {
            return Boolean(state.room && state.participantId && state.keyState?.hasKey);
        },

        participantNameById(state): (participantId: ParticipantId | 'assistant' | 'system') => string {
            return (participantId) => {
                if (participantId === 'assistant') {
                    return 'Assistant';
                }
                if (participantId === 'system') {
                    return 'System';
                }
                return state.participants.find((participant) => participant.id === participantId)?.nickname ?? participantId;
            };
        },

        chatMessages(state): ReforgedChatMessage[] {
            return state.messages
                .filter((message) => message.status !== 'deleted')
                .map((message) => ({
                    id: message.id,
                    sessionId: state.room?.id ?? 'multiplayer-room',
                    role: message.role,
                    content: message.content,
                    createdAt: message.createdAt,
                    updatedAt: message.updatedAt,
                    status: message.status === 'generating'
                        ? 'generating'
                        : message.status === 'failed'
                            ? 'failed'
                            : 'sent',
                    alternatives: message.alternatives.map((alternative) => ({
                        id: alternative.id,
                        content: alternative.content,
                        createdAt: alternative.createdAt,
                    })),
                    activeAlternativeIndex: message.alternatives.length === 0
                        ? -1
                        : Math.max(
                            0,
                            message.alternatives.findIndex((alternative) => alternative.id === message.activeAlternativeId),
                        ),
                    authorId: message.authorId,
                    seq: message.seq,
                }));
        },
    },

    actions: {
        setServerUrl(value: string): void {
            const normalized = normalizeHttpBaseUrl(value);
            if (normalized !== this.serverUrl) {
                activeClient = null;
            }
            this.serverUrl = normalized;
        },

        async createRoom(input: { title?: string; nickname: string; password: string }): Promise<void> {
            await this.joinWithResult(getClient(this.serverUrl).createRoom(input));
        },

        async joinRoom(input: RoomJoinRequest): Promise<void> {
            await this.joinWithResult(getClient(this.serverUrl).joinRoom(input));
        },

        async submitProviderKey(input: {
            api: ReforgedGenerationApi;
            baseUrl: string;
            model: string;
        }): Promise<void> {
            if (!this.room || !this.participantId) {
                this.lastError = {
                    code: 'room-not-connected',
                    message: 'Join a room before submitting a provider key.',
                };
                this.status = 'error';
                return;
            }

            const apiKey = takeMultiplayerProviderKeySecret();
            if (!apiKey) {
                this.lastError = {
                    code: 'provider-key-missing',
                    message: 'Provider key is no longer available in memory.',
                };
                return;
            }

            this.lastError = null;
            const result = await getClient(this.serverUrl).submitParticipantKey({
                roomId: this.room.id,
                participantId: this.participantId,
                provider: {
                    api: input.api,
                    baseUrl: input.baseUrl.trim().replace(/\/+$/g, ''),
                    model: input.model.trim(),
                },
                apiKey,
                persistForRoom: false,
            });

            this.keyState = result.keyState;
            this.upsertParticipant({
                id: result.participantId,
                keyState: result.keyState,
            });
        },

        sendChatMessage(content: string): void {
            if (!this.room) {
                return;
            }

            this.sendSocketPayload({
                type: 'chat.append',
                request: {
                    roomId: this.room.id,
                    content,
                },
            });
        },

        requestGeneration(): void {
            if (!this.room || !this.participantId || !this.keyState?.hasKey) {
                this.lastError = {
                    code: 'provider-key-missing',
                    message: 'Submit your provider key before triggering generation.',
                };
                return;
            }

            const requestId = this.createGenerationRequestId();
            const request: GenerationRequest = {
                id: requestId,
                roomId: this.room.id,
                triggerParticipantId: this.participantId,
                provider: {
                    api: this.keyState.provider,
                    baseUrl: this.keyState.baseUrl,
                    model: this.keyState.model,
                    keyRef: this.keyState.keyRef,
                },
                contextRevision: this.revision,
                requestedAt: new Date().toISOString(),
            };

            this.sendSocketPayload({
                type: 'generation.request',
                request,
            });
        },

        sendChatMessageAndGenerate(content: string): void {
            this.sendChatMessage(content);
            if (this.keyState?.hasKey) {
                this.requestGeneration();
            }
        },

        cancelActiveGeneration(): void {
            const generation = this.activeGenerations[0];
            if (!this.room || !generation) {
                return;
            }

            this.sendSocketPayload({
                type: 'generation.cancel',
                request: {
                    roomId: this.room.id,
                    requestId: generation.requestId,
                },
            });
        },

        disconnect(): void {
            activeSocket?.close();
            activeSocket = null;
            activeClient = null;
            this.socketConnected = false;
            this.status = this.room ? 'idle' : 'idle';
        },

        applyServerPayload(payload: RoomServerPayload): void {
            if (payload.type === 'room.snapshot') {
                this.applySnapshot(payload.snapshot);
                return;
            }

            if (payload.type === 'room.event') {
                this.applyEvent(payload.event);
                return;
            }

            if (payload.type === 'room.events') {
                for (const event of payload.page.events) {
                    this.applyEvent(event);
                }
                this.latestSeq = payload.page.latestSeq;
                this.revision = payload.page.revision;
                return;
            }

            if (payload.type === 'generation.status') {
                this.upsertGeneration(payload.status);
                return;
            }

            if (payload.type === 'room.error') {
                this.lastError = payload.error;
                if (payload.seq !== undefined) {
                    this.latestSeq = payload.seq;
                }
                if (payload.revision !== undefined) {
                    this.revision = payload.revision;
                }
            }
        },

        applySnapshot(snapshot: RoomSnapshot): void {
            this.room = snapshot.room;
            this.participants = snapshot.participants;
            this.messages = snapshot.messages;
            this.activeGenerations = snapshot.activeGenerations;
            this.latestSeq = snapshot.latestSeq;
            this.revision = snapshot.revision;
            this.keyState = this.participantId
                ? snapshot.participants.find((participant) => participant.id === this.participantId)?.keyState ?? this.keyState
                : this.keyState;
            this.status = 'connected';
        },

        applyEvent(event: RoomEvent): void {
            this.latestSeq = event.seq;
            this.revision = event.revision;

            switch (event.type) {
                case 'room.created':
                    this.room = event.room;
                    break;
                case 'participant.joined':
                case 'participant.updated':
                    this.upsertParticipant(event.participant);
                    if (event.participant.id === this.participantId) {
                        this.keyState = event.participant.keyState ?? this.keyState;
                    }
                    break;
                case 'participant.left':
                    this.upsertParticipant({
                        id: event.participantId,
                        presence: event.presence,
                    });
                    break;
                case 'chat.appended':
                    this.upsertMessage(event.message);
                    break;
                case 'chat.edited':
                    this.patchMessage(event.messageId, {
                        content: event.content,
                        updatedAt: event.updatedAt,
                        status: 'edited',
                    });
                    break;
                case 'chat.deleted':
                    this.patchMessage(event.messageId, {
                        deletedAt: event.deletedAt,
                        status: 'deleted',
                    });
                    break;
                case 'chat.swipe-selected':
                    this.patchMessage(event.messageId, {
                        activeAlternativeId: event.activeAlternativeId,
                    });
                    break;
                case 'generation.status':
                    this.upsertGeneration(event.status);
                    break;
                case 'generation.chunk':
                    this.appendGenerationChunk(event.outputMessageId, event.delta);
                    break;
                case 'generation.completed':
                    this.removeGeneration(event.status.requestId);
                    this.upsertMessage(event.message);
                    break;
                case 'generation.cancelled':
                    this.removeGeneration(event.status.requestId);
                    break;
                case 'generation.failed':
                    this.removeGeneration(event.status.requestId);
                    this.lastError = event.status.error;
                    break;
                case 'generation.requested':
                    break;
            }
        },

        upsertParticipant(patch: Partial<ParticipantPublicProfile> & { id: ParticipantId }): void {
            const index = this.participants.findIndex((participant) => participant.id === patch.id);
            if (index >= 0) {
                this.participants[index] = {
                    ...this.participants[index],
                    ...patch,
                };
                return;
            }

            this.participants.push({
                id: patch.id,
                nickname: patch.nickname ?? patch.id,
                role: patch.role ?? 'participant',
                presence: patch.presence ?? 'online',
                joinedAt: patch.joinedAt ?? new Date().toISOString(),
                canGenerate: patch.canGenerate ?? true,
                keyState: patch.keyState,
                lastSeenAt: patch.lastSeenAt,
            });
        },

        upsertMessage(message: RoomChatMessage): void {
            const index = this.messages.findIndex((item) => item.id === message.id);
            if (index >= 0) {
                this.messages[index] = message;
            } else {
                this.messages.push(message);
            }
            this.messages.sort((left, right) => left.seq - right.seq);
        },

        patchMessage(messageId: RoomMessageId, patch: Partial<RoomChatMessage>): void {
            const message = this.messages.find((item) => item.id === messageId);
            if (!message) {
                return;
            }

            Object.assign(message, patch);
        },

        appendGenerationChunk(messageId: RoomMessageId, delta: string): void {
            const message = this.messages.find((item) => item.id === messageId);
            if (message) {
                message.content += delta;
                message.status = 'generating';
            }
        },

        upsertGeneration(status: GenerationStatus): void {
            const index = this.activeGenerations.findIndex((item) => item.requestId === status.requestId);
            if (status.state === 'completed' || status.state === 'cancelled' || status.state === 'failed') {
                this.removeGeneration(status.requestId);
                return;
            }

            if (index >= 0) {
                this.activeGenerations[index] = status;
            } else {
                this.activeGenerations.push(status);
            }
        },

        removeGeneration(requestId: GenerationRequestId): void {
            this.activeGenerations = this.activeGenerations.filter((item) => item.requestId !== requestId);
        },

        createGenerationRequestId(): GenerationRequestId {
            const id = globalThis.crypto?.randomUUID?.() ?? `generation-${this.nextGenerationLocalId}`;
            this.nextGenerationLocalId += 1;
            return id;
        },

        sendSocketPayload(payload: RoomClientPayload): void {
            try {
                activeSocket?.send(payload);
            } catch (error) {
                this.lastError = {
                    code: 'socket-send-failed',
                    message: error instanceof Error ? error.message : String(error),
                };
            }
        },

        async joinWithResult(joinPromise: Promise<RoomJoinResult>): Promise<void> {
            this.status = 'connecting';
            this.lastError = null;

            try {
                const result = await joinPromise;
                this.participantId = result.participantId;
                this.resumeToken = result.resumeToken;
                this.applySnapshot(result.snapshot);
                this.openSocket(result);
            } catch (error) {
                this.status = 'error';
                this.lastError = {
                    code: 'join-failed',
                    message: error instanceof Error ? error.message : String(error),
                };
            }
        },

        openSocket(result: RoomJoinResult): void {
            const client = getClient(this.serverUrl);
            activeSocket?.close();
            activeSocket = markRaw(client.openRoomSocket({
                roomId: result.roomId,
                participantId: result.participantId,
                resumeToken: result.resumeToken,
                handlers: {
                    onOpen: () => {
                        this.socketConnected = true;
                        this.status = 'connected';
                    },
                    onClose: () => {
                        this.socketConnected = false;
                    },
                    onError: () => {
                        this.lastError = {
                            code: 'socket-error',
                            message: 'Room socket failed.',
                        };
                    },
                    onPayload: (payload) => this.applyServerPayload(payload),
                },
            }));
        },
    },
});

export function setMultiplayerClientFactoryForTest(factory: MultiplayerClientFactory | null): void {
    multiplayerClientFactory = factory ?? createMultiplayerClient;
    activeClient = null;
    activeSocket = null;
    pendingProviderKeySecret = null;
}

export function setMultiplayerProviderKeySecret(value: string): void {
    const normalized = value.trim();
    pendingProviderKeySecret = normalized || null;
}

export function resetMultiplayerSecretVaultForTest(): void {
    pendingProviderKeySecret = null;
}

function getClient(serverUrl: string): ReforgedMultiplayerClient {
    if (!activeClient) {
        activeClient = markRaw(multiplayerClientFactory({
            baseUrl: serverUrl,
        }));
    }
    return activeClient;
}

function takeMultiplayerProviderKeySecret(): string | null {
    const secret = pendingProviderKeySecret;
    pendingProviderKeySecret = null;
    return secret;
}
