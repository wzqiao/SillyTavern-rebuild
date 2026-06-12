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
    const baseUrl = httpBaseUrl(server);

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

test('stub chat completions work without a key for smoke tests', async () => {
    let fetchCalls = 0;
    const server = createReforgedServer({
        generationMode: 'stub',
        fetch: async () => {
            fetchCalls += 1;
            throw new Error('stub mode should not call provider');
        },
    });

    await server.listen(0);
    const baseUrl = httpBaseUrl(server);

    try {
        const response = await fetch(`${baseUrl}/api/reforged/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                baseUrl: 'https://unused-provider.test/v1',
                model: 'gpt-stub',
                messages: [
                    { role: 'system', content: 'You are a stub.' },
                    { role: 'user', content: 'Hello from smoke.' },
                ],
                stream: false,
                sampling: {
                    temperature: 0.7,
                },
            }),
        });

        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type') ?? '', /application\/json/i);
        const payload = await response.json();
        assert.equal(payload.object, 'chat.completion');
        assert.equal(payload.model, 'gpt-stub');
        assert.equal(payload.choices[0].message.role, 'assistant');
        assert.equal(payload.choices[0].message.content, 'Stub reply: Hello from smoke.');
        assert.equal(fetchCalls, 0);
    } finally {
        await server.close();
    }
});

test('stub chat completions stream OpenAI-compatible SSE chunks without a key', async () => {
    const server = createReforgedServer({
        generationMode: 'stub',
    });

    await server.listen(0);
    const baseUrl = httpBaseUrl(server);

    try {
        const response = await fetch(`${baseUrl}/api/reforged/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                baseUrl: 'https://unused-provider.test/v1',
                model: 'gpt-stub-stream',
                messages: [
                    { role: 'user', content: 'Stream this.' },
                ],
                stream: true,
            }),
        });

        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/i);
        const events = await readSseResponse(response);
        assert.equal(events.at(-1), '[DONE]');
        const chunks = events.filter((event) => event !== '[DONE]').map((event) => JSON.parse(event));
        assert.equal(chunks[0].object, 'chat.completion.chunk');
        assert.equal(chunks[0].choices[0].delta.role, 'assistant');
        assert.equal(chunks[1].choices[0].delta.content, 'Stub reply: Stream this.');
        assert.equal(chunks[2].choices[0].finish_reason, 'stop');
    } finally {
        await server.close();
    }
});

test('proxy chat completions forward provider SSE as OpenAI-compatible chunks', async () => {
    const requests = [];
    const server = createReforgedServer({
        generationMode: 'proxy',
        fetch: async (url, init) => {
            requests.push({
                url,
                authorization: init.headers.Authorization,
                accept: init.headers.Accept,
                body: JSON.parse(init.body),
            });
            return sseResponse([
                'data: {"id":"provider-1","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}\n\n',
                'data: {"id":"provider-1","choices":[{"index":0,"delta":{"content":"Hello SSE"},"finish_reason":null}]}\n\n',
                'data: {"id":"provider-1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
                'data: [DONE]\n\n',
            ]);
        },
    });

    await server.listen(0);
    const baseUrl = httpBaseUrl(server);

    try {
        const response = await fetch(`${baseUrl}/api/reforged/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer sk-route-secret',
            },
            body: JSON.stringify({
                baseUrl: 'https://provider-stream.test/v1',
                model: 'stream-model',
                messages: [
                    { role: 'user', content: 'Say hello.' },
                ],
                stream: true,
                max_tokens: 128,
                sampling: {
                    temperature: 0.25,
                    top_p: 0.9,
                },
            }),
        });

        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/i);
        const events = await readSseResponse(response);
        assert.equal(events.at(-1), '[DONE]');
        const chunks = events.filter((event) => event !== '[DONE]').map((event) => JSON.parse(event));
        assert.equal(chunks[0].object, 'chat.completion.chunk');
        assert.equal(chunks[0].choices[0].delta.role, 'assistant');
        assert.equal(chunks[1].choices[0].delta.content, 'Hello SSE');
        assert.equal(chunks[2].choices[0].finish_reason, 'stop');

        assert.equal(requests[0].authorization, 'Bearer sk-route-secret');
        assert.equal(requests[0].accept, 'text/event-stream');
        assert.equal(requests[0].url, 'https://provider-stream.test/v1/chat/completions');
        assert.equal(requests[0].body.model, 'stream-model');
        assert.equal(requests[0].body.stream, true);
        assert.equal(requests[0].body.max_tokens, 128);
        assert.equal(requests[0].body.temperature, 0.25);
        assert.equal(requests[0].body.top_p, 0.9);

        const serialized = JSON.stringify({ events });
        assert.equal(serialized.includes('sk-route-secret'), false);
    } finally {
        await server.close();
    }
});

test('provider errors are sanitized for JSON and SSE responses', async () => {
    const server = createReforgedServer({
        generationMode: 'proxy',
        fetch: async (_url, init) => {
            const auth = init.headers.Authorization;
            return new Response(JSON.stringify({
                error: {
                    message: `bad auth ${auth} sk-very-secret provider-body`,
                },
            }), {
                status: 401,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        },
    });

    await server.listen(0);
    const baseUrl = httpBaseUrl(server);

    try {
        const jsonResponse = await fetch(`${baseUrl}/api/reforged/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer sk-very-secret',
            },
            body: JSON.stringify({
                baseUrl: 'https://provider-error.test/v1',
                model: 'error-model',
                messages: [
                    { role: 'user', content: 'Trigger error.' },
                ],
                stream: false,
            }),
        });

        assert.equal(jsonResponse.status, 401);
        const jsonPayload = await jsonResponse.json();
        assert.equal(jsonPayload.error, 'Provider returned HTTP 401.');
        const jsonSerialized = JSON.stringify(jsonPayload);
        assert.equal(jsonSerialized.includes('sk-very-secret'), false);
        assert.equal(jsonSerialized.includes('Authorization'), false);
        assert.equal(jsonSerialized.includes('provider-body'), false);

        const sseResponse = await fetch(`${baseUrl}/api/reforged/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer sk-very-secret',
            },
            body: JSON.stringify({
                baseUrl: 'https://provider-error.test/v1',
                model: 'error-model',
                messages: [
                    { role: 'user', content: 'Trigger SSE error.' },
                ],
                stream: true,
            }),
        });

        assert.equal(sseResponse.status, 200);
        assert.match(sseResponse.headers.get('content-type') ?? '', /text\/event-stream/i);
        const sseEvents = await readSseResponse(sseResponse);
        assert.equal(sseEvents.at(-1), '[DONE]');
        const errorEvent = JSON.parse(sseEvents.find((event) => event !== '[DONE]'));
        assert.equal(errorEvent.error.code, 'http-401');
        assert.equal(errorEvent.error.message, 'Provider returned HTTP 401.');
        const sseSerialized = JSON.stringify(errorEvent);
        assert.equal(sseSerialized.includes('sk-very-secret'), false);
        assert.equal(sseSerialized.includes('Authorization'), false);
        assert.equal(sseSerialized.includes('provider-body'), false);
    } finally {
        await server.close();
    }
});

test('two websocket clients can share a room and receive generated replies', async () => {
    const server = createReforgedServer({
        generationMode: 'stub',
    });

    await server.listen(0);
    const baseUrl = httpBaseUrl(server);

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

function httpBaseUrl(server) {
    return `http://127.0.0.1:${server.httpServer.address().port}`;
}

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

function sseResponse(chunks) {
    return new Response(new ReadableStream({
        start(controller) {
            for (const chunk of chunks) {
                controller.enqueue(new TextEncoder().encode(chunk));
            }
            controller.close();
        },
    }), {
        status: 200,
        headers: {
            'Content-Type': 'text/event-stream',
        },
    });
}

async function readSseResponse(response) {
    const text = await response.text();
    return text
        .split(/\r?\n\r?\n/u)
        .map((chunk) => chunk.trim())
        .filter(Boolean)
        .map((chunk) => chunk.replace(/^data:\s?/u, ''));
}

test('rejects non-http provider urls and oversized request bodies', async () => {
    const server = createReforgedServer({
        generationMode: 'proxy',
        fetch: async () => {
            throw new Error('provider fetch must not be reached');
        },
    });

    await server.listen(0);
    const baseUrl = httpBaseUrl(server);

    try {
        const badScheme = await fetch(`${baseUrl}/api/reforged/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer sk-test',
            },
            body: JSON.stringify({
                baseUrl: 'file:///etc/passwd',
                model: 'demo',
                messages: [{ role: 'user', content: 'hi' }],
                stream: false,
            }),
        });
        assert.equal(badScheme.status, 400);
        const badSchemePayload = await badScheme.json();
        assert.match(badSchemePayload.error, /http or https/);

        const oversized = await fetch(`${baseUrl}/api/reforged/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer sk-test',
            },
            body: JSON.stringify({
                baseUrl: 'https://api.example.com/v1',
                model: 'demo',
                messages: [{ role: 'user', content: 'a'.repeat(3 * 1024 * 1024) }],
                stream: false,
            }),
        });
        assert.equal(oversized.status, 413);
    } finally {
        await server.close();
    }
});

test('storage routes persist envelopes and kv across server restarts', async (t) => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dataDir = mkdtempSync(join(tmpdir(), 'reforged-storage-'));
    t.after(() => rmSync(dataDir, { recursive: true, force: true }));

    const first = createReforgedServer({ generationMode: 'stub', dataDir });
    await first.listen(0);
    const baseA = httpBaseUrl(first);

    try {
        await postJson(`${baseA}/api/reforged/storage/characters/put`, {
            envelopes: [
                { id: 'a', revision: 1, persistedAt: 'x', data: { id: 'a', name: 'Alice' } },
                { id: 'b', revision: 1, persistedAt: 'x', data: { id: 'b', name: 'Bob' } },
            ],
        });
        await postJson(`${baseA}/api/reforged/storage/characters/delete`, { ids: ['b'] });
        await fetch(`${baseA}/api/reforged/storage/kv/chat.meta`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: { selected: 'a' } }),
        });

        const listed = await (await fetch(`${baseA}/api/reforged/storage/characters`)).json();
        assert.equal(listed.envelopes.length, 1);
        assert.equal(listed.envelopes[0].data.name, 'Alice');

        const unknown = await fetch(`${baseA}/api/reforged/storage/not-a-store`);
        assert.equal(unknown.status, 404);
    } finally {
        await first.close();
    }

    // 重启:同 dataDir 数据仍在
    const second = createReforgedServer({ generationMode: 'stub', dataDir });
    await second.listen(0);
    const baseB = httpBaseUrl(second);

    try {
        const listed = await (await fetch(`${baseB}/api/reforged/storage/characters`)).json();
        assert.equal(listed.envelopes.length, 1);
        const kv = await (await fetch(`${baseB}/api/reforged/storage/kv/chat.meta`)).json();
        assert.deepEqual(kv.value, { selected: 'a' });
    } finally {
        await second.close();
    }
});
