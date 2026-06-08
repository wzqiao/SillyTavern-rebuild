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
- PNG embedded-card parser in `app/src/parsers/`, including native-compatible `ccv3` precedence and explicit reasons when compressed metadata cannot be decoded without a zlib dependency.
- Character import service in `app/src/services/`, unifying JSON and PNG parser results behind a typed M0 import result. YAML, CHARX, and BYAF are detected as native ST formats but intentionally reported as unsupported by the M0 front-end importer until dedicated parsers or backend handoff are designed.
- Pinia character store in `app/src/stores/`, keeping the M0 state layer thin: imported character roster, selected character, and the last import result. Parsing remains in `services` / `parsers`; the store does not touch browser `File` I/O or SillyTavern DOM.
- Draft chat contract in `app/src/contracts/chat.ts`, covering the M1-facing state shape for sessions, messages, assistant alternatives/swipes, readiness, pending generation state, local cancellation, and typed send results.
- Pure chat generation request service in `app/src/services/chatGenerationService.ts`, mapping Reforged chat sessions into the existing `HeadlessGenerationRequest` / chat-style prompt seam without leaking SillyTavern raw response shapes into stores or views.
- Pinia chat store in `app/src/stores/chatStore.ts`, keeping the M0 chat state layer thin: start/select/remove sessions, send user messages through an injectable `HeadlessEngineAdapter`, append assistant replies, prevent overlapping generations, locally cancel pending generations, and edit/delete/switch assistant alternatives. The store does not call `Generate()`, import `@sillytavern/*`, or touch legacy DOM.
- M0 HomeView workbench in `app/src/views/HomeView.vue`, connecting the character store and chat store into a visible mobile-first path: demo character import, roster selection, first message display, chat composer readiness, demo headless adapter replies, edit/delete, and local assistant alternatives. Runtime adapter mode is intentionally gated until same-origin SillyTavern runtime integration is verified, so the standalone Vite dev server does not statically import legacy external modules.

## Remaining M0 Verification
- Run the adapter inside the Vite app served from the same origin as SillyTavern and confirm the `@sillytavern/*` external URLs resolve.
- Capture real `adapter.inspect({ probeContext: true })` output in browser after ST runtime boot and add the result to this report.
- With user-provided API settings, trigger one real OpenAI-compatible generation and confirm whether streaming data can be consumed through the `sendOpenAIRequest` path.
- Inventory runtime import failures caused by missing legacy DOM nodes and decide between a minimal hidden compatibility layer or deeper engine extraction.
- Wire the character import service to a real file picker flow and validate against user-supplied JSON / PNG cards.
- Wire the character store to the file picker flow so a successful import automatically becomes selectable in the M0 vertical slice.
- Replace the HomeView demo adapter with a real same-origin runtime adapter path once M0 browser diagnostics confirm the SillyTavern external module URLs and API settings are available without legacy DOM breakage.
- Add a chat service seam for `sendChatCompletion()` streaming/non-streaming normalization before exposing true token streaming to UI. The current chat store uses `generateText()` for a stable string result and treats cancellation as local because that seam does not accept `AbortSignal`.
- Decide whether YAML, CHARX, and BYAF should be parsed in the front-end, delegated to the existing ST backend import endpoint, or deferred until after the M0 vertical slice.
- Decide whether old V1 JSON and `char_name` notebook-style JSON should be normalized in the front-end parser or delegated to the existing backend import path. The M0 front-end importer currently targets V2/V3-compatible cards per the PRD.
