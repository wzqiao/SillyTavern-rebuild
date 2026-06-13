// DRAFT: 待主干评审

import type {
    ChatAppendRequest,
    GenerationCancelRequest,
    ParticipantId,
    ParticipantKeySubmitRequest,
    ParticipantKeySubmitResult,
    RoomClientPayload,
    RoomId,
    RoomJoinRequest,
    RoomJoinResult,
    RoomServerPayload,
} from '@/contracts/multiplayer';
import { normalizeReforgedHttpBaseUrl, reforgedAuthHeaders, appendReforgedTokenQuery } from './reforgedRuntimeClient';

export interface ReforgedMultiplayerClientOptions {
    baseUrl?: string;
    fetch?: typeof fetch;
    WebSocket?: typeof WebSocket;
}

export interface ReforgedRoomSocketHandlers {
    onOpen?: () => void;
    onClose?: (event: CloseEvent) => void;
    onError?: (event: Event) => void;
    onPayload: (payload: RoomServerPayload) => void;
}

export interface ReforgedRoomSocketConnection {
    send(payload: RoomClientPayload): void;
    close(): void;
}

export interface ReforgedMultiplayerClient {
    createRoom(input: {
        title?: string;
        nickname: string;
        password: string;
    }): Promise<RoomJoinResult>;
    joinRoom(input: RoomJoinRequest): Promise<RoomJoinResult>;
    submitParticipantKey(input: ParticipantKeySubmitRequest): Promise<ParticipantKeySubmitResult>;
    appendChat(input: ChatAppendRequest): void;
    cancelGeneration(input: GenerationCancelRequest): void;
    openRoomSocket(input: {
        roomId: RoomId;
        participantId: ParticipantId;
        resumeToken: string;
        handlers: ReforgedRoomSocketHandlers;
    }): ReforgedRoomSocketConnection;
}

export function createMultiplayerClient(options: ReforgedMultiplayerClientOptions = {}): ReforgedMultiplayerClient {
    const baseUrl = normalizeHttpBaseUrl(options.baseUrl);
    const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);
    const WebSocketCtor = options.WebSocket ?? globalThis.WebSocket;
    let socket: ReforgedRoomSocketConnection | null = null;

    if (!fetchImpl) {
        throw new ReforgedMultiplayerClientError('fetch-unavailable', 'Fetch is not available in this runtime.');
    }

    return {
        createRoom(input) {
            return postJson(fetchImpl, baseUrl, '/api/reforged/rooms', input);
        },

        joinRoom(input) {
            return postJson(fetchImpl, baseUrl, '/api/reforged/rooms/join', input);
        },

        submitParticipantKey(input) {
            return postJson(
                fetchImpl,
                baseUrl,
                `/api/reforged/rooms/${encodeURIComponent(input.roomId)}/participants/${encodeURIComponent(input.participantId)}/key`,
                {
                    provider: input.provider,
                    apiKey: input.apiKey,
                    persistForRoom: input.persistForRoom,
                },
            );
        },

        appendChat(input) {
            socket?.send({ type: 'chat.append', request: input });
        },

        cancelGeneration(input) {
            socket?.send({ type: 'generation.cancel', request: input });
        },

        openRoomSocket(input) {
            if (!WebSocketCtor) {
                throw new ReforgedMultiplayerClientError('websocket-unavailable', 'WebSocket is not available in this runtime.');
            }

            socket?.close();
            const url = appendReforgedTokenQuery(createRoomSocketUrl(baseUrl, input));
            const ws = new WebSocketCtor(url);
            const connection: ReforgedRoomSocketConnection = {
                send(payload) {
                    if (ws.readyState !== WebSocketCtor.OPEN) {
                        throw new ReforgedMultiplayerClientError('socket-not-open', 'Room socket is not open yet.');
                    }
                    ws.send(JSON.stringify(payload));
                },
                close() {
                    if (ws.readyState === WebSocketCtor.OPEN || ws.readyState === WebSocketCtor.CONNECTING) {
                        ws.close();
                    }
                },
            };

            ws.addEventListener('open', () => input.handlers.onOpen?.());
            ws.addEventListener('close', (event) => {
                if (socket === connection) {
                    socket = null;
                }
                input.handlers.onClose?.(event);
            });
            ws.addEventListener('error', (event) => input.handlers.onError?.(event));
            ws.addEventListener('message', (event) => {
                try {
                    input.handlers.onPayload(parseRoomPayload(event.data));
                } catch (error) {
                    input.handlers.onPayload({
                        type: 'room.error',
                        error: {
                            code: 'invalid-server-payload',
                            message: describeError(error),
                        },
                    });
                }
            });

            socket = connection;
            return connection;
        },
    };
}

export class ReforgedMultiplayerClientError extends Error {
    constructor(
        readonly code: string,
        message: string,
    ) {
        super(message);
        this.name = 'ReforgedMultiplayerClientError';
    }
}

async function postJson<TResponse>(
    fetchImpl: typeof fetch,
    baseUrl: string,
    path: string,
    body: unknown,
): Promise<TResponse> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...reforgedAuthHeaders(),
        },
        body: JSON.stringify(body),
    });

    const payload = await readJson(response);

    if (!response.ok) {
        const message = isRecord(payload) && typeof payload.error === 'string'
            ? payload.error
            : `Reforged backend returned HTTP ${response.status}.`;
        throw new ReforgedMultiplayerClientError(`http-${response.status}`, message);
    }

    return payload as TResponse;
}

async function readJson(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) {
        return null;
    }

    try {
        return JSON.parse(text) as unknown;
    } catch {
        return text;
    }
}

function parseRoomPayload(data: unknown): RoomServerPayload {
    const text = typeof data === 'string' ? data : '';
    const payload = JSON.parse(text) as unknown;

    if (!isRecord(payload) || typeof payload.type !== 'string') {
        throw new Error('Room payload must be an object with a type.');
    }

    return payload as RoomServerPayload;
}

export function normalizeHttpBaseUrl(value: string | undefined): string {
    return normalizeReforgedHttpBaseUrl(value);
}

function createRoomSocketUrl(
    baseUrl: string,
    input: {
        roomId: RoomId;
        participantId: ParticipantId;
        resumeToken: string;
    },
): string {
    const httpUrl = new URL(baseUrl);
    httpUrl.protocol = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    httpUrl.pathname = `/api/reforged/rooms/${encodeURIComponent(input.roomId)}/ws`;
    httpUrl.searchParams.set('participantId', input.participantId);
    httpUrl.searchParams.set('resumeToken', input.resumeToken);
    return httpUrl.toString();
}

function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
