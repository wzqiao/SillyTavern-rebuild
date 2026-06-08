# M0 Engine Adapter Spike

## Status
Draft, 2026-06-09

## Scope
This note covers the first M0 adapter slice: verify the headless import seams that a new Vue UI can safely depend on without calling `Generate()` or touching SillyTavern's jQuery DOM.

## Findings
- `public/script.js` exports `generateRaw` and `generateRawData`, which accept prompt-oriented data and return generated text or raw provider data.
- `public/scripts/openai.js` exports `sendOpenAIRequest` from its export list, even though the function body is declared later in the file.
- `Generate()` remains exported from `public/script.js`, but it is DOM-heavy and is intentionally excluded from the new adapter.
- Both `public/script.js` and `public/scripts/openai.js` still have top-level DOM/UI references. Lazy importing keeps that risk contained to `engine-adapter` while M0 browser testing determines whether a hidden compatibility layer is required.
- Native SillyTavern PNG card import reads `tEXt` chunks with `chara` / `ccv3` keywords and treats the payload as base64-encoded UTF-8 JSON. `ccv3` takes precedence over `chara`.
- The Vue-side PNG parser intentionally adds compatibility beyond native ST by accepting direct JSON text, `iTXt`, and unsupported-compression diagnostics for `zTXt` / compressed `iTXt`.
- Native SillyTavern front-end file import accepts `json`, `png`, `yaml`, `yml`, `charx`, and `byaf` by extension. The existing backend dispatches by the submitted `file_type` rather than content sniffing.

## Implemented
- Draft engine contract in `app/src/contracts/engine.ts`.
- Headless adapter in `app/src/engine-adapter/` with diagnostics for `generateRaw`, `generateRawData`, and `sendOpenAIRequest`.
- Runtime probes for browser primitives, `eventSource` shape, optional `getContext()` calls, and the intentionally excluded DOM-heavy `Generate()` export.
- Vitest coverage proving the adapter delegates only to the headless exports and does not invoke `Generate()`.
- Draft character-card contract in `app/src/contracts/character.ts`.
- Pure JSON character-card parser in `app/src/parsers/`, covering the minimum V2/V3-like fields needed by the M0 import spike.
- JSON character-card parser compatibility for root-level V1-style cards and notebook-style aliases such as `char_name`, `char_persona`, `world_scenario`, and `char_greeting`; these normalize into the same M0 character contract without calling legacy import DOM.
- PNG embedded-card parser in `app/src/parsers/`, including native-compatible `ccv3` precedence and explicit reasons when compressed metadata cannot be decoded without a zlib dependency.
- Character import service in `app/src/services/`, unifying JSON and PNG parser results behind a typed M0 import result. YAML, CHARX, and BYAF are detected as native ST formats but intentionally reported as unsupported by the M0 front-end importer until dedicated parsers or backend handoff are designed.
- Pinia character store in `app/src/stores/`, keeping the M0 state layer thin: imported character roster, selected character, and the last import result. Parsing remains in `services` / `parsers`; the store does not touch browser `File` I/O or SillyTavern DOM.
- Browser file import helper in `app/src/services/characterFileImportService.ts`, converting JSON/PNG uploads into the existing character import contract before the HomeView file picker opens and selects the imported card.
- Draft worldbook contract in `app/src/contracts/worldbook.ts`, plus pure JSON parser/import service for native SillyTavern `{ entries: { ... } }` world info and Character Book-style `entries[]` lorebooks. M0 standardizes stable fields while preserving original entries and `extensions` in `raw` / `extensionsRaw` for later reversible editing.
- Pinia worldbook store in `app/src/stores/worldbookStore.ts`, mirroring the thin character-store pattern for imported lorebook library state, selected worldbook, last import result, and safe remove/clear flows. The store calls `importWorldbook()` only and does not touch `File`, parser internals, SillyTavern DOM, or `public/` code.
- Draft chat contract in `app/src/contracts/chat.ts`, covering the M1-facing state shape for sessions, messages, assistant alternatives/swipes, readiness, pending generation state, local cancellation, and typed send results.
- Pure chat generation request service in `app/src/services/chatGenerationService.ts`, mapping Reforged chat sessions into the existing `HeadlessGenerationRequest` / chat-style prompt seam without leaking SillyTavern raw response shapes into stores or views.
- Chat runtime normalization service in `app/src/services/chatRuntimeService.ts`, wrapping `HeadlessEngineAdapter.sendChatCompletion()` behind stable Reforged request/result/event types. It normalizes plain text, non-stream OpenAI-like JSON, multi-choice alternatives, reasoning/signature metadata, one-dimensional tool calls, and SillyTavern's streaming async-generator snapshots (`text`, `swipes`, `logprobs`, `toolCalls`, `state`) without exposing raw `unknown` provider data to stores or views.
- Lazy runtime adapter loader in `app/src/engine-adapter/runtimeAdapterLoader.ts`, keeping `@sillytavern/*` imports behind the runtime activation path instead of statically pulling legacy modules into the standalone Vite workbench.
- Pinia chat store in `app/src/stores/chatStore.ts`, keeping the M0 chat state layer thin: start/select/remove sessions, send user messages through an injectable `HeadlessEngineAdapter`, route Runtime mode through `chatRuntimeService`, append assistant replies and normalized alternatives, prevent overlapping generations, abort chat-completion runtime requests, and edit/delete/switch assistant alternatives. The store does not call `Generate()`, import `@sillytavern/*`, or touch legacy DOM.
- M0 HomeView workbench in `app/src/views/HomeView.vue`, connecting the character store and chat store into a visible mobile-first path: demo character import, roster selection, first message display, chat composer readiness, demo headless adapter replies, edit/delete, and local assistant alternatives. Runtime adapter mode now lazily loads the headless adapter, runs diagnostics before enabling sends, and surfaces safe failure details when standalone Vite cannot resolve the same-origin SillyTavern module URLs.
- Visible worldbook library panel in `app/src/views/HomeView.vue`, wiring the Pinia worldbook store into the M0 workbench for demo lorebook import, pasted SillyTavern world info JSON import, library selection, injection-ready entry counts, and a compact active-lore preview. The UI stays read-only; prompt string assembly remains in services.
- Lightweight lore context injection for chat sends: selected worldbooks are projected into injection-ready lore context in `app/src/services/worldbookLoreContextService.ts`, passed through `ReforgedChatSendInput`, and appended by `chatGenerationService` to both generate-text and chat-completion prompts. This keeps the HomeView/UI layer out of prompt string assembly and does not implement SillyTavern's full world-info activation, token-budget, recursion, or key-scan algorithm yet.
- Memory-only OpenAI-compatible connection draft contract and store in `app/src/contracts/connection.ts` / `app/src/stores/connectionStore.ts`, plus a compact HomeView API Draft panel. This lets M1 collect base URL, model, and API key in the new UI without persistence, connectivity testing, model fetching, or changes to the runtime adapter seam.

## Remaining M0 Verification
- Run the adapter inside the Vite app served from the same origin as SillyTavern and confirm the `@sillytavern/*` external URLs resolve.
- Capture real `adapter.inspect({ probeContext: true })` output in browser after ST runtime boot and add the result to this report.
- With user-provided API settings, trigger one real OpenAI-compatible generation and confirm whether streaming data can be consumed through the `sendOpenAIRequest` path.
- Decide how the memory-only connection draft should be safely handed to the SillyTavern runtime adapter or backend settings layer; the current draft panel is intentionally not a live connection and does not persist secrets.
- Inventory runtime import failures caused by missing legacy DOM nodes and decide between a minimal hidden compatibility layer or deeper engine extraction.
- Validate the file picker flow against a broader set of user-supplied JSON / PNG cards, including extensionless uploads that rely on MIME type detection.
- Validate the visible worldbook library and lightweight lore context injection against user-supplied SillyTavern world info exports, then decide where to implement the full world-info activation, token-budget, recursion, and key-scan algorithm.
- Validate the gated Runtime mode against a real same-origin SillyTavern runtime, including diagnostics display, chat-completion request shape, normalized alternatives/swipes, and abort behavior.
- Confirm whether `sendOpenAIRequest()` can run in the new app without legacy DOM breakage once API settings and same-origin module URLs are available.
- Decide whether YAML, CHARX, and BYAF should be parsed in the front-end, delegated to the existing ST backend import endpoint, or deferred until after the M0 vertical slice.
