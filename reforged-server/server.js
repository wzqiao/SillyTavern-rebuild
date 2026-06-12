// DRAFT: M4 backend spike, pending mainline review.

import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { URL } from 'node:url';
import { WebSocketServer } from 'ws';

const DEFAULT_PORT = 8787;
const JSON_HEADERS = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

export function createReforgedServer(options = {}) {
    const rooms = new Map();
    const credentialVault = new Map();
    const fetchImpl = options.fetch ?? globalThis.fetch;
    const now = options.now ?? (() => new Date().toISOString());
    const id = options.id ?? (() => randomUUID());
    const generationMode = options.generationMode ?? 'proxy';

    const httpServer = createHttpServer(async (request, response) => {
        try {
            if (request.method === 'OPTIONS') {
                response.writeHead(204, JSON_HEADERS);
                response.end();
                return;
            }

            const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);

            if (request.method === 'POST' && url.pathname === '/api/reforged/rooms') {
                const body = await readJsonBody(request);
                const result = createRoom(body);
                writeJson(response, 200, result);
                return;
            }

            if (request.method === 'POST' && url.pathname === '/api/reforged/rooms/join') {
                const body = await readJsonBody(request);
                const result = joinRoom(body);
                writeJson(response, 200, result);
                return;
            }

            const keyMatch = url.pathname.match(/^\/api\/reforged\/rooms\/([^/]+)\/participants\/([^/]+)\/key$/);
            if (request.method === 'POST' && keyMatch) {
                const body = await readJsonBody(request);
                const result = submitParticipantKey(decodeURIComponent(keyMatch[1]), decodeURIComponent(keyMatch[2]), body);
                writeJson(response, 200, result);
                return;
            }

            if (request.method === 'GET' && url.pathname === '/api/reforged/health') {
                writeJson(response, 200, {
                    ok: true,
                    rooms: rooms.size,
                });
                return;
            }

            writeJson(response, 404, {
                error: 'Not found.',
            });
        } catch (error) {
            const status = error instanceof PublicHttpError ? error.status : 500;
            writeJson(response, status, {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });

    const wss = new WebSocketServer({
        noServer: true,
    });

    httpServer.on('upgrade', (request, socket, head) => {
        const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
        const match = url.pathname.match(/^\/api\/reforged\/rooms\/([^/]+)\/ws$/);
        if (!match) {
            socket.destroy();
            return;
        }

        const roomId = decodeURIComponent(match[1]);
        const participantId = url.searchParams.get('participantId') ?? '';
        const resumeToken = url.searchParams.get('resumeToken') ?? '';
        const room = rooms.get(roomId);
        if (!room || room.resumeTokens.get(participantId) !== resumeToken) {
            socket.destroy();
            return;
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request, {
                roomId,
                participantId,
            });
        });
    });

    wss.on('connection', (ws, _request, context) => {
        const room = rooms.get(context.roomId);
        const participant = room?.participants.get(context.participantId);
        if (!room || !participant) {
            ws.close();
            return;
        }

        participant.presence = 'online';
        participant.lastSeenAt = now();
        room.clients.set(context.participantId, ws);
        send(ws, {
            type: 'room.snapshot',
            snapshot: toSnapshot(room),
        });

        ws.on('message', (data) => {
            void handleSocketPayload(room, context.participantId, data).catch((error) => {
                send(ws, {
                    type: 'room.error',
                    error: publicError(error),
                    seq: room.latestSeq,
                    revision: room.revision,
                });
            });
        });

        ws.on('close', () => {
            if (room.clients.get(context.participantId) === ws) {
                room.clients.delete(context.participantId);
            }
            participant.presence = 'offline';
            participant.lastSeenAt = now();
        });
    });

    function createRoom(body) {
        const nickname = readRequiredString(body, 'nickname');
        const password = readRequiredString(body, 'password');
        const roomId = `room-${id()}`;
        const inviteCode = `invite-${id()}`;
        const participantId = `participant-${id()}`;
        const resumeToken = `resume-${id()}`;
        const createdAt = now();
        const room = {
            id: roomId,
            title: readOptionalString(body, 'title') || 'Reforged room',
            inviteCode,
            passwordHash: hashPassword(password),
            createdAt,
            updatedAt: createdAt,
            createdBy: participantId,
            latestSeq: 0,
            revision: 0,
            eventLog: [],
            participants: new Map(),
            messages: new Map(),
            activeGenerations: new Map(),
            resumeTokens: new Map(),
            clients: new Map(),
        };
        rooms.set(roomId, room);

        room.participants.set(participantId, createParticipant({
            id: participantId,
            nickname,
            role: 'host',
            joinedAt: createdAt,
        }));
        room.resumeTokens.set(participantId, resumeToken);
        appendEvent(room, {
            type: 'room.created',
            actorId: 'system',
            room: toRoomMetadata(room),
        });
        appendEvent(room, {
            type: 'participant.joined',
            actorId: participantId,
            participant: toPublicParticipant(room.participants.get(participantId)),
        });

        return {
            roomId,
            participantId,
            resumeToken,
            snapshot: toSnapshot(room),
        };
    }

    function joinRoom(body) {
        const roomId = resolveRoomId(body);
        const room = rooms.get(roomId);
        if (!room) {
            throw new PublicHttpError(404, 'Room not found.');
        }

        const password = readRequiredString(body, 'password');
        if (!verifyPassword(password, room.passwordHash)) {
            throw new PublicHttpError(403, 'Room password is invalid.');
        }

        const participantId = `participant-${id()}`;
        const resumeToken = `resume-${id()}`;
        const joinedAt = now();
        const participant = createParticipant({
            id: participantId,
            nickname: readRequiredString(body, 'nickname'),
            role: 'participant',
            joinedAt,
        });
        room.participants.set(participantId, participant);
        room.resumeTokens.set(participantId, resumeToken);
        const event = appendEvent(room, {
            type: 'participant.joined',
            actorId: participantId,
            participant: toPublicParticipant(participant),
        });
        broadcast(room, {
            type: 'room.event',
            event,
        });

        return {
            roomId: room.id,
            participantId,
            resumeToken,
            snapshot: toSnapshot(room),
        };
    }

    function submitParticipantKey(roomId, participantId, body) {
        const room = requireRoom(roomId);
        const participant = requireParticipant(room, participantId);
        const provider = body?.provider ?? {};
        const apiKey = readRequiredString(body, 'apiKey');
        const keyState = {
            keyRef: `keyref-${participantId}-${id()}`,
            ownerParticipantId: participantId,
            provider: readOptionalString(provider, 'api') || 'openai',
            baseUrl: readRequiredString(provider, 'baseUrl').replace(/\/+$/g, ''),
            model: readRequiredString(provider, 'model'),
            hasKey: true,
            maskedLabel: maskSecret(apiKey),
            updatedAt: now(),
        };

        credentialVault.set(participantId, {
            apiKey,
            provider: keyState,
        });
        participant.keyState = keyState;
        const event = appendEvent(room, {
            type: 'participant.updated',
            actorId: participantId,
            participant: toPublicParticipant(participant),
        });
        broadcast(room, {
            type: 'room.event',
            event,
        });

        return {
            roomId: room.id,
            participantId,
            keyState,
        };
    }

    async function handleSocketPayload(room, participantId, rawData) {
        const payload = JSON.parse(rawData.toString());
        if (payload.type === 'room.sync') {
            const afterSeq = Number(payload.request?.afterSeq ?? 0);
            send(room.clients.get(participantId), {
                type: 'room.events',
                page: {
                    roomId: room.id,
                    fromSeqExclusive: afterSeq,
                    events: room.eventLog.filter((event) => event.seq > afterSeq),
                    latestSeq: room.latestSeq,
                    revision: room.revision,
                },
            });
            return;
        }

        if (payload.type === 'chat.append') {
            const content = readRequiredString(payload.request, 'content');
            const message = createRoomMessage(room, {
                role: 'user',
                content,
                authorId: participantId,
                status: 'sent',
            });
            const event = appendEvent(room, {
                type: 'chat.appended',
                actorId: participantId,
                message,
            });
            broadcast(room, {
                type: 'room.event',
                event,
            });
            return;
        }

        if (payload.type === 'generation.request') {
            await handleGenerationRequest(room, participantId, payload.request);
            return;
        }

        if (payload.type === 'generation.cancel') {
            const requestId = readRequiredString(payload.request, 'requestId');
            const status = room.activeGenerations.get(requestId);
            if (status) {
                status.state = 'cancelled';
                status.updatedAt = now();
                status.finishedAt = status.updatedAt;
                room.activeGenerations.delete(requestId);
                const event = appendEvent(room, {
                    type: 'generation.cancelled',
                    actorId: participantId,
                    status,
                });
                broadcast(room, {
                    type: 'room.event',
                    event,
                });
            }
            return;
        }

        throw new PublicHttpError(400, `Unsupported room payload: ${payload.type}`);
    }

    async function handleGenerationRequest(room, participantId, request) {
        const participant = requireParticipant(room, participantId);
        const credential = credentialVault.get(participantId);
        if (!credential?.apiKey || !participant.keyState?.hasKey) {
            throw new PublicHttpError(400, 'Submit your provider key before generating.');
        }

        const publicRequest = {
            id: readOptionalString(request, 'id') || `generation-${id()}`,
            roomId: room.id,
            triggerParticipantId: participantId,
            provider: {
                api: participant.keyState.provider,
                baseUrl: participant.keyState.baseUrl,
                model: participant.keyState.model,
                keyRef: participant.keyState.keyRef,
            },
            contextRevision: room.revision,
            targetMessageId: readOptionalString(request, 'targetMessageId') || undefined,
            characterId: readOptionalString(request, 'characterId') || undefined,
            sampling: request?.sampling ?? null,
            requestedAt: now(),
        };
        const status = {
            requestId: publicRequest.id,
            roomId: room.id,
            state: 'running',
            triggerParticipantId: participantId,
            provider: publicRequest.provider,
            contextRevision: room.revision,
            startedAt: now(),
            updatedAt: now(),
        };
        room.activeGenerations.set(status.requestId, status);
        broadcast(room, {
            type: 'room.event',
            event: appendEvent(room, {
                type: 'generation.requested',
                actorId: participantId,
                request: publicRequest,
            }),
        });
        broadcast(room, {
            type: 'room.event',
            event: appendEvent(room, {
                type: 'generation.status',
                actorId: participantId,
                status,
            }),
        });

        try {
            const reply = generationMode === 'stub'
                ? `房间生成通过：${participant.nickname}`
                : await proxyOpenAiChatCompletion({
                    room,
                    credential,
                    signal: undefined,
                });
            const message = createRoomMessage(room, {
                role: 'assistant',
                content: reply,
                authorId: 'assistant',
                status: 'sent',
            });
            status.state = 'completed';
            status.updatedAt = now();
            status.finishedAt = status.updatedAt;
            status.outputMessageId = message.id;
            room.activeGenerations.delete(status.requestId);
            broadcast(room, {
                type: 'room.event',
                event: appendEvent(room, {
                    type: 'generation.completed',
                    actorId: participantId,
                    status,
                    message,
                }),
            });
        } catch (error) {
            status.state = 'failed';
            status.updatedAt = now();
            status.finishedAt = status.updatedAt;
            status.error = publicGenerationError(error);
            room.activeGenerations.delete(status.requestId);
            broadcast(room, {
                type: 'room.event',
                event: appendEvent(room, {
                    type: 'generation.failed',
                    actorId: participantId,
                    status,
                }),
            });
        }
    }

    async function proxyOpenAiChatCompletion({ room, credential, signal }) {
        if (!fetchImpl) {
            throw new PublicHttpError(500, 'Fetch is not available for generation proxying.');
        }

        const provider = credential.provider;
        const response = await fetchImpl(`${provider.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${credential.apiKey}`,
            },
            body: JSON.stringify({
                model: provider.model,
                stream: false,
                messages: roomMessagesForOpenAi(room),
            }),
            signal,
        });

        if (!response.ok) {
            throw new PublicHttpError(response.status, `Provider returned HTTP ${response.status}.`);
        }

        const body = await response.json();
        return body?.choices?.[0]?.message?.content ?? body?.choices?.[0]?.text ?? '';
    }

    function appendEvent(room, eventPatch) {
        const createdAt = now();
        room.latestSeq += 1;
        room.revision += 1;
        room.updatedAt = createdAt;
        const event = {
            id: `event-${room.latestSeq}-${id()}`,
            roomId: room.id,
            seq: room.latestSeq,
            revision: room.revision,
            createdAt,
            ...eventPatch,
        };
        const immutableEvent = clonePublicValue(event);
        room.eventLog.push(immutableEvent);
        return immutableEvent;
    }

    function createRoomMessage(room, input) {
        const createdAt = now();
        return {
            id: `message-${id()}`,
            role: input.role,
            content: input.content,
            authorId: input.authorId,
            status: input.status,
            createdAt,
            seq: room.latestSeq + 1,
            revision: room.revision + 1,
            alternatives: input.role === 'assistant'
                ? [{
                    id: `alternative-${id()}`,
                    content: input.content,
                    authorId: input.authorId,
                    createdAt,
                    seq: room.latestSeq + 1,
                }]
                : [],
            activeAlternativeId: undefined,
        };
    }

    function broadcast(room, payload) {
        const serialized = JSON.stringify(payload);
        for (const ws of room.clients.values()) {
            if (ws.readyState === 1) {
                ws.send(serialized);
            }
        }
    }

    function requireRoom(roomId) {
        const room = rooms.get(roomId);
        if (!room) {
            throw new PublicHttpError(404, 'Room not found.');
        }
        return room;
    }

    function toSnapshot(room) {
        return {
            room: toRoomMetadata(room),
            participants: [...room.participants.values()].map(toPublicParticipant),
            messages: [...room.eventLog]
                .filter((event) => event.type === 'chat.appended' || event.type === 'generation.completed')
                .map((event) => event.type === 'chat.appended' ? event.message : event.message),
            activeGenerations: [...room.activeGenerations.values()],
            latestSeq: room.latestSeq,
            revision: room.revision,
            serverTime: now(),
        };
    }

    function toRoomMetadata(room) {
        return {
            id: room.id,
            title: room.title,
            accessMode: 'password',
            link: {
                roomId: room.id,
                inviteCode: room.inviteCode,
                url: `http://localhost:5173/#/chat?room=${encodeURIComponent(room.id)}`,
            },
            createdAt: room.createdAt,
            updatedAt: room.updatedAt,
            createdBy: room.createdBy,
        };
    }

    return {
        httpServer,
        rooms,
        credentialVault,
        listen(port = DEFAULT_PORT, host = '127.0.0.1') {
            return new Promise((resolve) => {
                httpServer.listen(port, host, () => {
                    resolve(httpServer.address());
                });
            });
        },
        close() {
            return new Promise((resolve, reject) => {
                for (const client of wss.clients) {
                    client.close();
                }
                wss.close(() => {
                    httpServer.close((error) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve();
                        }
                    });
                });
            });
        },
    };
}

function createParticipant(input) {
    return {
        id: input.id,
        nickname: input.nickname,
        role: input.role,
        presence: 'online',
        joinedAt: input.joinedAt,
        lastSeenAt: input.joinedAt,
        canGenerate: true,
        keyState: undefined,
    };
}

function toPublicParticipant(participant) {
    return {
        id: participant.id,
        nickname: participant.nickname,
        role: participant.role,
        presence: participant.presence,
        joinedAt: participant.joinedAt,
        lastSeenAt: participant.lastSeenAt,
        canGenerate: participant.canGenerate,
        keyState: participant.keyState,
    };
}

function roomMessagesForOpenAi(room) {
    const messages = [];
    for (const event of room.eventLog) {
        if (event.type === 'chat.appended' || event.type === 'generation.completed') {
            messages.push({
                role: event.message.role,
                content: event.message.content,
            });
        }
    }
    return messages.length > 0 ? messages : [{ role: 'user', content: 'Continue the scene.' }];
}

function resolveRoomId(body) {
    if (typeof body?.roomId === 'string' && body.roomId.trim()) {
        return body.roomId.trim();
    }
    if (typeof body?.roomLink === 'string' && body.roomLink.trim()) {
        const url = new URL(body.roomLink);
        const hashQueryIndex = url.hash.indexOf('?');
        const hashParams = new URLSearchParams(hashQueryIndex >= 0 ? url.hash.slice(hashQueryIndex + 1) : '');
        return (
            url.searchParams.get('room') ??
            url.searchParams.get('roomId') ??
            hashParams.get('room') ??
            hashParams.get('roomId') ??
            ''
        );
    }
    if (typeof body?.inviteCode === 'string' && body.inviteCode.trim()) {
        throw new PublicHttpError(400, 'Invite-code lookup is not implemented in this spike; pass roomId or roomLink.');
    }
    throw new PublicHttpError(400, 'roomId or roomLink is required.');
}

function requireParticipant(room, participantId) {
    const participant = room.participants.get(participantId);
    if (!participant) {
        throw new PublicHttpError(404, 'Participant not found.');
    }
    return participant;
}

function readRequiredString(value, field) {
    const candidate = value?.[field];
    if (typeof candidate !== 'string' || !candidate.trim()) {
        throw new PublicHttpError(400, `${field} is required.`);
    }
    return candidate.trim();
}

function readOptionalString(value, field) {
    const candidate = value?.[field];
    return typeof candidate === 'string' ? candidate.trim() : '';
}

async function readJsonBody(request) {
    const chunks = [];
    for await (const chunk of request) {
        chunks.push(chunk);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    return text ? JSON.parse(text) : {};
}

function writeJson(response, status, body) {
    response.writeHead(status, JSON_HEADERS);
    response.end(JSON.stringify(body));
}

function send(ws, payload) {
    if (ws?.readyState === 1) {
        ws.send(JSON.stringify(payload));
    }
}

function hashPassword(password) {
    return createHash('sha256').update(password).digest('hex');
}

function verifyPassword(password, expectedHash) {
    const actual = Buffer.from(hashPassword(password));
    const expected = Buffer.from(expectedHash);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function maskSecret(secret) {
    if (secret.length <= 4) {
        return '****';
    }
    return `${secret.slice(0, 3)}****${secret.slice(-4)}`;
}

function publicError(error) {
    if (error instanceof PublicHttpError) {
        return {
            code: `http-${error.status}`,
            message: error.message,
            retryable: error.status >= 500,
        };
    }
    return {
        code: 'generation-failed',
        message: error instanceof Error ? error.message : String(error),
        retryable: false,
    };
}

function publicGenerationError(error) {
    if (error instanceof PublicHttpError) {
        return {
            code: `http-${error.status}`,
            message: error.message,
            retryable: error.status >= 500,
        };
    }

    return {
        code: 'generation-failed',
        message: 'Generation failed before completion.',
        retryable: false,
    };
}

function clonePublicValue(value) {
    return JSON.parse(JSON.stringify(value));
}

class PublicHttpError extends Error {
    constructor(status, message) {
        super(message);
        this.name = 'PublicHttpError';
        this.status = status;
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const port = Number(process.env.REFORGED_PORT ?? DEFAULT_PORT);
    const server = createReforgedServer({
        generationMode: process.env.REFORGED_GENERATION_MODE ?? 'proxy',
    });
    server.listen(port, '127.0.0.1').then((address) => {
        console.log(`[st-reforged] backend listening on ${JSON.stringify(address)}`);
    });
}
