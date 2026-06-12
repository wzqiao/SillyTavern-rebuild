# Reforged Server

M4/M4.1 backend runtime for ST-Reforged. This process is intentionally small and in-memory so the room protocol, websocket flow, OpenAI-compatible generation proxy, and credential rules can be verified before choosing durable storage.

## Run

```bash
REFORGED_GENERATION_MODE=stub node reforged-server/server.js
```

Default address: `http://127.0.0.1:8787`.

`REFORGED_GENERATION_MODE=stub` returns a local assistant reply for browser smoke tests. Without it, generation proxies OpenAI-compatible `POST {baseUrl}/chat/completions` using the triggering participant's server-side vault key.

## Protocol

### Single-player runtime

- `POST /api/reforged/chat/completions`
  Proxies ordinary OpenAI-compatible chat completions for the new Vue frontend.
  Request body follows Reforged's normalized runtime contract: `{ "baseUrl": string, "model": string, "messages": [], "stream": boolean, "sampling"?: object }`.
  The raw provider key is accepted only as transient request material, preferably `Authorization: Bearer ...`.
  `stream: true` returns OpenAI-compatible `text/event-stream`; `stream: false` returns OpenAI-compatible JSON.

### Multiplayer rooms

- `POST /api/reforged/rooms`
  Creates a password room and joins the creator. Body: `{ "title"?: string, "nickname": string, "password": string }`.
- `POST /api/reforged/rooms/join`
  Joins with room id/link, nickname, and password. Body follows `RoomJoinRequest`.
- `POST /api/reforged/rooms/:roomId/participants/:participantId/key`
  Stores a participant provider key in the transient server vault. Raw `apiKey` is accepted only here.
- `GET /api/reforged/rooms/:roomId/ws?participantId=...&resumeToken=...`
  WebSocket endpoint for `RoomClientPayload` and `RoomServerPayload`.

## Security Rules

- Raw API keys are held only in the in-memory `credentialVault`.
- Single-player runtime keys are transient and must not be written to room state, event logs, response bodies, or console logs.
- Raw API keys are not written to room snapshots, append-only events, WebSocket payloads, persisted files, or console logs.
- Generation uses the WebSocket participant id as authority and ignores any client-supplied raw key.
- The first version uses room passwords, not accounts. This is not yet sufficient for public untrusted deployments.

## Tests

```bash
node --test reforged-server/server.test.js
```

The test covers password joins, WebSocket broadcast, per-participant generation key selection, and raw-key absence from public state/events.
