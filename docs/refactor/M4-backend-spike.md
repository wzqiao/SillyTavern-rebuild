# M4 Backend Spike · Reforged Multiplayer Rooms

> Status: implemented as a minimal spike on `reforge/m4-backend-spike`.
> Scope: prove the new Reforged backend direction from ADR-005 without replacing the legacy ST backend yet.

## What Landed

- Contract draft: `app/src/contracts/multiplayer.ts`.
- Frontend room client: `app/src/services/multiplayerClient.ts`.
- Frontend room state: `app/src/stores/multiplayerStore.ts`.
- Minimal chat-page room entry: `app/src/components/MultiplayerRoomPanel.vue`, mounted in `ChatView.vue`.
- Backend spike: `reforged-server/server.js`.
- Safety tests:
  - `app/src/stores/multiplayerStore.test.ts`
  - `reforged-server/server.test.js`

## Protocol

The frontend and backend use the M4 contract draft:

- `POST /api/reforged/rooms`
  Creates a room and returns `RoomJoinResult`.
- `POST /api/reforged/rooms/join`
  Joins by room id or room link with nickname and password.
- `POST /api/reforged/rooms/:roomId/participants/:participantId/key`
  Submits a participant-owned provider key into the backend transient vault.
- `GET /api/reforged/rooms/:roomId/ws?participantId=...&resumeToken=...`
  Opens a WebSocket for `RoomClientPayload` and `RoomServerPayload`.

Room state is server-authoritative. Chat messages, participant changes, and generation lifecycle updates are append-only `RoomEvent` records with monotonic `seq` and `revision`.

## Credential Model

Each participant submits their own OpenAI-compatible config/key. The backend stores the raw key only in an in-memory vault keyed by `participantId`.

Public room data may include:

- `keyRef`
- `maskedLabel`
- `baseUrl`
- `model`
- `hasKey`

Public room data must not include:

- raw `apiKey`
- bearer token headers
- raw provider errors that could echo secrets

Generation requests are authorized by the WebSocket participant id. The backend uses that participant's vault entry and ignores any client-provided raw key.

## Current Spike Limits

- Storage is in-memory only; restarting the process drops rooms and keys.
- Room identity is password + resume token only; no accounts, moderation, or rate limiting.
- Invite-code lookup is not implemented; join by room id or room link is implemented.
- Generation streaming is not exposed as token chunks yet. The proxy currently returns a completed assistant message; `generation.chunk` remains in the contract for the next phase.
- The room UI is intentionally compact and mounted in chat for validation. It is not the final multiplayer lobby.
- Legacy ST backend remains available for existing single-player runtime compatibility.

## Verification

Required gates for this spike:

```bash
cd app && npm run type-check
cd app && npm run test
cd app && npm run build
node --test reforged-server/server.test.js
```

Manual smoke:

1. Start backend: `REFORGED_GENERATION_MODE=stub node reforged-server/server.js`.
2. Start frontend: `cd app && npm run dev`.
3. Open two browser tabs to `http://localhost:5173/#/chat`.
4. Create a room in tab A with nickname/password.
5. Join the same room id in tab B with another nickname and the same password.
6. Send a message from either tab and confirm both tabs receive it.
7. Submit a key in the room panel and send again; in stub mode both tabs should receive the assistant completion.

## Next Phase

- Add durable room/event storage behind a repository interface.
- Decide deployment store: SQLite for self-hosting first, PostgreSQL adapter later.
- Implement streaming `generation.chunk` events.
- Add host controls, rate limits, cancellation ownership rules, and room cleanup.
- Replace the legacy proxy path only after parity tests cover OpenAI-compatible streaming and error behavior.
