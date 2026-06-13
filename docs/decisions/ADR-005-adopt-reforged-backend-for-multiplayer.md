# ADR-005: Adopt a Reforged Backend for Multiplayer Rooms

## Status
Accepted

## Date
2026-06-12

## Context
M2 phase three added browser-direct OpenAI-compatible generation with automatic fallback to the legacy SillyTavern proxy. Real-provider testing confirmed the limit of that approach: providers that reject browser CORS preflight still require a server-side proxy. The product direction is also no longer only a single-user local frontend. ST-Reforged is intended to become a server-hosted, multiplayer tavern where several players share the same roleplay session.

The original PRD kept the backend mostly unchanged and deferred online play to M4. `docs/refactor/M2-persistence-compat-plan.md` updated that direction: the multiplayer end state requires a Reforged-owned backend with WebSocket rooms and server-authoritative session state. The project owner has now confirmed the product requirements for that backend:
- The final product should run on a server and support multiplayer rooms.
- The first multiplayer identity model should use room links, nicknames, and room passwords rather than full accounts.
- Each player should be able to provide and use their own API key.
- Any player in the room may trigger AI generation.
- Room state should be server-authoritative and based on append-only events, continuing the existing `seq` / `revision` direction.
- The legacy SillyTavern backend should be replaced by the new Reforged backend rather than kept as the long-term runtime dependency.

## Decision
Build a Reforged-owned backend for M4 and make it the long-term runtime authority for multiplayer play, generation proxying, and session persistence.

The backend will be designed around:
- Server deployment as the primary target, not only local single-user use.
- WebSocket rooms for realtime multiplayer presence, message sync, and generation status.
- Room access through shareable room links, user-chosen nicknames, and room passwords for the first version.
- Server-authoritative room state represented as an append-only event log. Messages, participant joins/leaves, generation starts, generation chunks, edits, deletes, and swipe selections should be events with monotonically ordered `seq` values.
- Per-player API key ownership. A player's key is submitted to the Reforged backend over an authenticated room/session channel and used only for that player's generation requests. The backend must not broadcast raw keys to other players.
- Generation triggering by any room participant. The event log records which participant triggered a generation and which participant-owned key/provider configuration was used.
- Replacing the legacy SillyTavern backend for Reforged runtime traffic once the Reforged backend can proxy OpenAI-compatible chat completions and stream results.

The Vue frontend should continue using contracts and repositories so local IndexedDB storage can be replaced by backend-backed repositories without rewriting product flows.

## Alternatives Considered

### Keep the Legacy SillyTavern Backend Permanently
- Pros: Already handles proxying, static assets, CSRF, and existing SillyTavern compatibility.
- Cons: It is not designed as a Reforged multiplayer room authority, and keeping it permanently preserves the old backend as a hard runtime dependency.
- Rejected: It conflicts with the product goal of a server-hosted multiplayer Reforged tavern and the project owner's preference to replace it with a new backend.

### Browser-Only Multiplayer With Provider Direct Calls
- Pros: Avoids backend work for single-user direct providers and keeps API keys in the browser.
- Cons: Provider CORS support is inconsistent; browser clients cannot safely coordinate authoritative room state; every user would expose generation behavior to their own browser runtime only.
- Rejected: Real testing already showed CORS failures, and multiplayer needs server authority.

### Require Accounts Before Multiplayer
- Pros: Clearer long-term identity, billing, moderation, and permission model.
- Cons: Heavy for the first multiplayer version and slows down room-play validation.
- Rejected for the first version: Use room links, nicknames, and room passwords first. Accounts can be added later if public deployment needs stronger identity.

### Room Owner Pays For All Generation
- Pros: Simple mental model and easier provider configuration.
- Cons: Does not match the desired social model where each participant can bring their own key and trigger their own generations.
- Rejected: The first multiplayer design should support per-player keys.

## Consequences
- M4 must introduce backend code and deployment concerns rather than only frontend refactors.
- The current legacy proxy remains a short-term bridge only. New generation work should avoid deepening coupling to SillyTavern's `/api/backends/chat-completions/generate` path unless needed for compatibility.
- API key handling becomes a server security boundary. The backend must define storage, lifetime, redaction, and logging rules before shipping multiplayer generation.
- The room event log becomes the primary consistency model. Existing `authorId`, `seq`, `participants`, `updatedAt`, and `revision` fields remain useful and should be kept aligned with future backend event schemas.
- Allowing any participant to trigger generation requires visible attribution, cancellation rules, rate limiting, and conflict handling.
- A room password model is not a full auth system. Public/server deployments may later need accounts, moderation tools, invite roles, and abuse controls.

## Initial M4 Implementation Notes
- Start with one Reforged backend process that serves the Vue app, exposes REST endpoints for room bootstrap and provider/key setup, and exposes WebSocket endpoints for room events.
- Keep OpenAI-compatible chat completions as the first proxy target. Preserve SSE streaming semantics so the existing frontend normalizer can continue consuming snapshots or stream chunks.
- Treat keys as per-participant secrets. Do not include raw keys in event logs, persisted room state, debug logs, or WebSocket broadcasts.
- Model room permissions explicitly even if the first version is simple: participant, host, and system roles should be representable.
- Keep legacy ST engine compatibility behind adapter boundaries. The new backend should replace proxy and multiplayer responsibilities, not copy legacy UI/DOM assumptions.

## Open Questions
- Should participant API keys be stored only for the live room session, or can players opt into encrypted server-side persistence?
- What is the minimum host moderation surface: kick, mute, revoke generation permission, delete message, or lock room?
- How should simultaneous generation requests be scheduled: allow parallel generations, queue per room, or queue per character?
- Which durable store should the Reforged backend use first: SQLite for self-hosting simplicity, PostgreSQL for server deployments, or an adapter that supports both?
- What migration path should existing local IndexedDB data use when a user promotes a local session into a hosted multiplayer room?
