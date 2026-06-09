# ADR-003: Accept Direct Backend Chat-Completions Seam for Memory-Only Runtime Requests

## Status
Proposed

## Date
2026-06-09

## Context
ADR-002 kept Runtime sending blocked because the legacy `sendOpenAIRequest()` path builds requests from SillyTavern `oai_settings` and has no reviewed per-request connection injection seam.

Further review found a narrower backend seam in the existing SillyTavern Express endpoint:
- `POST /api/backends/chat-completions/generate` dispatches OpenAI-compatible requests when `chat_completion_source` is `openai`.
- In that branch, `reverse_proxy` supplies the OpenAI-compatible base URL and `proxy_password` supplies the bearer token for that request.
- CSRF is enforced by `GET /csrf-token` plus `X-CSRF-Token`.

This allows ST-Reforged to attempt real chat-completion requests without mutating `oai_settings`, writing ST secrets, touching `public/`, or operating legacy DOM.

## Decision
Add an `engine-adapter` direct backend chat-completions seam for OpenAI-compatible Runtime requests.

The adapter may set `runtimeConnectionInjected: true` only when:
- A connection draft has been applied in memory.
- The loaded runtime adapter advertises `supportsDirectBackendChatCompletion`.
- The chat request carries the applied connection through `HeadlessChatCompletionRequest.runtimeConnection`.

The direct request must:
- Fetch `/csrf-token` before the POST.
- Use same-origin credentials and `X-CSRF-Token`.
- Send `chat_completion_source: 'openai'`, `reverse_proxy`, `proxy_password`, `model`, `messages`, and `stream`.
- Avoid copying API keys into chat stores, chat messages, runtime snapshots, diagnostics, or local logs.
- Avoid `public/scripts/openai.js` settings/preset mutation paths.

The current connection UI keeps the draft API key in Pinia memory state until the user clears it or refreshes the page. This is accepted for M0 as "memory-only, not persisted"; a stricter "only in call stack / closure" secret boundary would need a separate connection-store redesign.

## Alternatives Considered

### Keep Runtime blocked until a new Reforged backend exists
- Pros: Clean security boundary.
- Cons: Delays M0 real-generation validation even though ST already has a request-scoped proxy seam.
- Rejected for M0: The direct seam is bounded and testable enough for a spike-grade Runtime attempt.

### Mutate SillyTavern `oai_settings`
- Pros: Reuses the existing frontend generation builder.
- Cons: Risks persistence, races, and DOM/settings coupling.
- Rejected: Violates the headless adapter boundary.

### Persist connection secrets into ST secret storage
- Pros: Matches legacy ST provider flow.
- Cons: Breaks the memory-only connection requirement.
- Rejected: Secret persistence needs a separate security and UX design.

## Consequences
- Runtime mode can attempt real OpenAI-compatible requests after an applied in-memory connection and passing adapter diagnostics.
- `HeadlessChatCompletionRequest` now has optional `runtimeConnection`, `responseLength`, and `stream` fields.
- This is still a same-origin ST backend path, not a direct browser-to-provider request.
- Residual risk: SillyTavern backend debug logging may include upstream request bodies, prompts, responses, or error bodies. The normal OpenAI-compatible request body sent upstream does not include `proxy_password`, but prompts and responses may still appear in backend logs.
- Residual risk: OpenAI-compatible streaming tool calls are provider-specific. The adapter now merges common OpenAI `delta.tool_calls[index].function.arguments` chunks, but broader tool-call compatibility should be rechecked before exposing tool execution UX.
- Future hardening should either gate ST debug logging for this seam or move memory-only Runtime requests behind a Reforged-owned backend/session layer.
