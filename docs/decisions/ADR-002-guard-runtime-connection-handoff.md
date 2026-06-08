# ADR-002: Guard Runtime Connection Handoff Until a Request Injection Seam Exists

## Status
Proposed

## Date
2026-06-09

## Context
ST-Reforged now has a memory-only OpenAI-compatible connection draft for `baseUrl`, `model`, and `apiKey`. The draft is intentionally not persisted. The next M0 question was whether this draft can be injected into real SillyTavern chat-completion runtime requests without changing `public/`, mutating legacy DOM, or writing SillyTavern global settings.

The current headless runtime path calls `sendOpenAIRequest(type, messages, signal, { jsonSchema })` from `public/scripts/openai.js`. That function derives the model and request body from module-level `oai_settings`, then posts to `/api/backends/chat-completions/generate` with `getRequestHeaders()`. Its only options object field currently used by the app-side seam is `jsonSchema`.

The backend chat-completions endpoint then selects provider URL and credentials from the generated request body plus backend secrets. For OpenAI it uses `request.body.reverse_proxy || API_OPENAI` and `readSecret(..., SECRET_KEYS.OPENAI, request.body.secret_id)`. For custom OpenAI-compatible endpoints it uses `request.body.custom_url` plus the backend custom secret. This is a SillyTavern settings/secrets path, not an app-side per-request `baseUrl/model/apiKey` handoff.

## Decision
Do not treat a memory-only Reforged connection draft as usable runtime request configuration until a safe injection seam exists.

The connection runtime handoff state may report that a draft is complete and applied in memory, and it may report that the runtime adapter diagnostics passed. However, it must still remain `applied-but-unwired` unless the caller explicitly proves that the applied draft is injected into the real request path.

## Alternatives Considered

### Pass `baseUrl`, `model`, and `apiKey` through `sendOpenAIRequest` options
- Pros: Small app-side API shape.
- Cons: The current SillyTavern function only consumes `jsonSchema`; additional fields would be ignored unless `public/scripts/openai.js` changed.
- Rejected for now: It would create a false connected state.

### Mutate `oai_settings` before each request
- Pros: Reuses the existing SillyTavern generation builder.
- Cons: Writes legacy module global settings, risks persistence coupling, races between requests, and bypasses the Reforged contract boundary.
- Rejected: It violates the headless adapter isolation intent.

### Store the API key in browser storage or SillyTavern secrets
- Pros: Could make the existing backend endpoint work.
- Cons: The M1 connection draft is explicitly memory-only and must not persist secrets.
- Rejected: Persistence requires a separate security design.

### Add a Reforged backend/session settings layer
- Pros: Could provide a real request-time connection source without touching legacy DOM.
- Cons: Requires a mainline architecture decision and likely backend changes.
- Deferred: This is a candidate next step, not an M0 UI assumption.

## Consequences
- Runtime mode can still run adapter diagnostics, but sending remains blocked when only the memory draft exists.
- `ReforgedConnectionRuntimeHandoffInput` separates `runtimeAdapterReady` from `runtimeConnectionInjected`.
- The UI should say that the adapter is ready but the connection draft is not wired into real SillyTavern requests yet.
- A future implementation must explicitly set `runtimeConnectionInjected: true` only after building a reviewed settings bridge, backend session layer, or adapter shim.
