import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createReforgedServer } from './server.js';

test('rooms require password, broadcast chat, and keep raw keys out of public state', async () => {
    const requests = [];
    const server = createReforgedServer({
        generationMode: 'proxy',
        fetch: async (url, init) => {
            requests.push({
                url,
                authorization: init.headers.Authorization,
                body: JSON.parse(init.body),
            });
            return new Response(JSON.stringify({
                choices: [{
                    message: {
                        content: '代理生成通过',
                    },
                }],
            }), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        },
    });

    await server.listen(0);
    const baseUrl = `http://127.0.0.1:${server.httpServer.address().port}`;

    try {
        const alice = await postJson(`${baseUrl}/api/reforged/rooms`, {
            title: 'M4 room',
            nickname: 'Alice',
            password: 'secret-room',
        });
        await assert.rejects(
            () => postJson(`${baseUrl}/api/reforged/rooms/join`, {
                roomId: alice.roomId,
                nickname: 'Bob',
                password: 'wrong',
            }),
            /Room password is invalid/,
        );

        const bob = await postJson(`${baseUrl}/api/reforged/rooms/join`, {
            roomId: alice.roomId,
            nickname: 'Bob',
            password: 'secret-room',
        });
        const aliceSocket = await openSocket(baseUrl, alice);
        const bobSocket = await openSocket(baseUrl, bob);
        await Promise.all([aliceSocket.next(), bobSocket.next()]);

        await postJson(`${baseUrl}/api/reforged/rooms/${alice.roomId}/participants/${alice.participantId}/key`, {
            provider: {
                api: 'openai',
                baseUrl: 'https://provider-a.test/v1',
                model: 'model-a',
            },
            apiKey: 'sk-alice-secret',
        });
        await postJson(`${baseUrl}/api/reforged/rooms/${bob.roomId}/participants/${bob.participantId}/key`, {
            provider: {
                api: 'openai',
                baseUrl: 'https://provider-b.test/v1',
                model: 'model-b',
            },
            apiKey: 'sk-bob-secret',
        });

        aliceSocket.ws.send(JSON.stringify({
            type: 'chat.append',
            request: {
                roomId: alice.roomId,
                content: 'Hello room.',
            },
        }));
        const bobChatEvent = await bobSocket.until((payload) => payload.type === 'room.event' && payload.event.type === 'chat.appended');
        assert.equal(bobChatEvent.event.message.content, 'Hello room.');

        bobSocket.ws.send(JSON.stringify({
            type: 'generation.request',
            request: {
                id: 'generation-bob',
                roomId: bob.roomId,
                triggerParticipantId: bob.participantId,
                provider: {
                    api: 'openai',
                    baseUrl: 'https://fake-client.test/v1',
                    model: 'fake-client',
                    keyRef: 'client-keyref-ignored',
                },
                contextRevision: bob.snapshot.revision,
                requestedAt: '2026-06-12T00:00:00.000Z',
            },
        }));
        const completeEvent = await aliceSocket.until((payload) => payload.type === 'room.event' && payload.event.type === 'generation.completed');
        assert.equal(completeEvent.event.message.content, '代理生成通过');
        assert.equal(requests.at(-1).authorization, 'Bearer sk-bob-secret');
        assert.equal(requests.at(-1).url, 'https://provider-b.test/v1/chat/completions');
        assert.equal(requests.at(-1).body.model, 'model-b');

        const publicDump = JSON.stringify({
            aliceSnapshot: alice.snapshot,
            bobSnapshot: bob.snapshot,
            bobChatEvent,
            completeEvent,
            eventLog: server.rooms.get(alice.roomId).eventLog,
        });
        assert.equal(publicDump.includes('sk-alice-secret'), false);
        assert.equal(publicDump.includes('sk-bob-secret'), false);
        assert.equal(publicDump.includes('apiKey'), false);
        assert.equal(server.credentialVault.get(bob.participantId).apiKey, 'sk-bob-secret');

        aliceSocket.close();
        bobSocket.close();
    } finally {
        await server.close();
    }
});

test('two websocket clients can share a room and receive generated replies', async () => {
    const server = createReforgedServer({
        generationMode: 'stub',
    });

    await server.listen(0);
    const baseUrl = `http://127.0.0.1:${server.httpServer.address().port}`;

    try {
        const alice = await postJson(`${baseUrl}/api/reforged/rooms`, {
            title: 'Two client smoke',
            nickname: 'Alice',
            password: 'room-pass',
        });
        const bob = await postJson(`${baseUrl}/api/reforged/rooms/join`, {
            roomLink: `http://localhost:5173/#/chat?room=${alice.roomId}`,
            nickname: 'Bob',
            password: 'room-pass',
        });
        const aliceSocket = await openSocket(baseUrl, alice);
        const bobSocket = await openSocket(baseUrl, bob);
        await Promise.all([aliceSocket.next(), bobSocket.next()]);

        await postJson(`${baseUrl}/api/reforged/rooms/${alice.roomId}/participants/${alice.participantId}/key`, {
            provider: {
                api: 'openai',
                baseUrl: 'https://provider-a.test/v1',
                model: 'model-a',
            },
            apiKey: 'sk-alice-smoke-secret',
        });
        await postJson(`${baseUrl}/api/reforged/rooms/${bob.roomId}/participants/${bob.participantId}/key`, {
            provider: {
                api: 'openai',
                baseUrl: 'https://provider-b.test/v1',
                model: 'model-b',
            },
            apiKey: 'sk-bob-smoke-secret',
        });

        bobSocket.ws.send(JSON.stringify({
            type: 'chat.append',
            request: {
                roomId: bob.roomId,
                content: 'Bob can speak from another client.',
            },
        }));
        bobSocket.ws.send(JSON.stringify({
            type: 'generation.request',
            request: {
                id: 'generation-bob-smoke',
                roomId: bob.roomId,
                triggerParticipantId: bob.participantId,
                provider: {
                    api: 'openai',
                    baseUrl: 'client-ignored',
                    model: 'client-ignored',
                    keyRef: 'client-ignored',
                },
                contextRevision: bob.snapshot.revision,
                requestedAt: '2026-06-12T00:00:00.000Z',
            },
        }));

        const aliceSawBob = await aliceSocket.until((payload) => (
            payload.type === 'room.event' &&
            payload.event.type === 'chat.appended' &&
            payload.event.message.content === 'Bob can speak from another client.'
        ));
        const aliceSawGeneration = await aliceSocket.until((payload) => (
            payload.type === 'room.event' &&
            payload.event.type === 'generation.completed' &&
            payload.event.message.content === '房间生成通过：Bob'
        ));

        assert.equal(aliceSawBob.event.actorId, bob.participantId);
        assert.equal(aliceSawGeneration.event.actorId, bob.participantId);
        assert.equal(aliceSawGeneration.event.status.triggerParticipantId, bob.participantId);
        assert.equal(aliceSawGeneration.event.status.provider.model, 'model-b');
        assert.equal(aliceSawGeneration.event.status.provider.baseUrl, 'https://provider-b.test/v1');

        const publicDump = JSON.stringify({
            aliceSawBob,
            aliceSawGeneration,
            aliceSnapshot: alice.snapshot,
            bobSnapshot: bob.snapshot,
            eventLog: server.rooms.get(alice.roomId).eventLog,
        });
        assert.equal(publicDump.includes('sk-alice-smoke-secret'), false);
        assert.equal(publicDump.includes('sk-bob-smoke-secret'), false);
        assert.equal(publicDump.includes('apiKey'), false);

        aliceSocket.close();
        bobSocket.close();
    } finally {
        await server.close();
    }
});

async function postJson(url, body) {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) {
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
    }
    return payload;
}

function openSocket(baseUrl, joinResult) {
    const wsUrl = new URL(baseUrl);
    wsUrl.protocol = 'ws:';
    wsUrl.pathname = `/api/reforged/rooms/${joinResult.roomId}/ws`;
    wsUrl.searchParams.set('participantId', joinResult.participantId);
    wsUrl.searchParams.set('resumeToken', joinResult.resumeToken);

    return new Promise((resolve, reject) => {
        const queue = [];
        const waiters = [];
        const ws = new WebSocket(wsUrl);
        ws.on('error', reject);
        ws.on('open', () => {
            resolve({
                ws,
                close: () => ws.close(),
                next: () => nextPayload(queue, waiters),
                until: (predicate) => untilPayload(queue, waiters, predicate),
            });
        });
        ws.on('message', (data) => {
            const payload = JSON.parse(data.toString());
            queue.push(payload);
            flushWaiters(queue, waiters);
        });
    });
}

function nextPayload(queue, waiters) {
    return untilPayload(queue, waiters, () => true);
}

function untilPayload(queue, waiters, predicate) {
    const index = queue.findIndex(predicate);
    if (index >= 0) {
        const [payload] = queue.splice(index, 1);
        return Promise.resolve(payload);
    }

    return new Promise((resolve) => {
        waiters.push({
            predicate,
            resolve,
        });
    });
}

function flushWaiters(queue, waiters) {
    for (let index = 0; index < waiters.length; index += 1) {
        const waiter = waiters[index];
        const payloadIndex = queue.findIndex(waiter.predicate);
        if (payloadIndex >= 0) {
            const [payload] = queue.splice(payloadIndex, 1);
            waiters.splice(index, 1);
            index -= 1;
            waiter.resolve(payload);
        }
    }
}
