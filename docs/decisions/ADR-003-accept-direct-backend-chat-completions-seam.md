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

Runtime mode may set `runtimeDirectRequestReady: true` only when:
- A connection draft has been applied in memory.
- The loaded runtime adapter advertises `supportsDirectBackendChatCompletion`.
- The chat send input carries a provider function that can materialize a single-use runtime connection from the transient connection vault immediately before `HeadlessChatCompletionRequest.runtimeConnection` is built.

The direct request must:
- Fetch `/csrf-token` before the POST.
- Use same-origin credentials and `X-CSRF-Token`.
- Send `chat_completion_source: 'openai'`, `reverse_proxy`, `proxy_password`, `model`, `messages`, and `stream`.
- Avoid copying API keys into chat stores, chat messages, runtime snapshots, diagnostics, or local logs.
- Avoid `public/scripts/openai.js` settings/preset mutation paths.

The connection and chat stores must not put raw API keys into Pinia's serializable state or action payloads. Pinia state keeps only non-sensitive metadata (`hasValue` and `maskedValue`), while the raw key lives in a module-scoped transient vault. Runtime mode gets the raw key through `takeRuntimeConnection()`, a single-use provider function on the runtime handoff that materializes a request object immediately before the chat-completion request is built.

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
- `ReforgedConnectionRuntimeHandoff` exposes safe display metadata plus `takeRuntimeConnection()` instead of returning a long-lived raw-key object.
- `ReforgedChatSendInput` accepts a `runtimeConnectionProvider` function instead of a raw `runtimeConnection` object so Pinia action payloads do not carry API keys.
- This is still a same-origin ST backend path, not a direct browser-to-provider request.
- Residual risk: the raw API key still exists in the password input DOM while the user types, in the transient in-memory vault after entry, and in the same-origin backend request body as `proxy_password`. The boundary here is "not in Pinia/devtools/serializable state or action payloads", not "never in browser memory".
- Residual risk: SillyTavern backend debug logging may include upstream request bodies, prompts, responses, or error bodies. The normal OpenAI-compatible request body sent upstream does not include `proxy_password`, but prompts and responses may still appear in backend logs.
- Residual risk: OpenAI-compatible streaming tool calls are provider-specific. The adapter now merges common OpenAI `delta.tool_calls[index].function.arguments` chunks, but broader tool-call compatibility should be rechecked before exposing tool execution UX.
- Future hardening should either gate ST debug logging for this seam or move memory-only Runtime requests behind a Reforged-owned backend/session layer.
