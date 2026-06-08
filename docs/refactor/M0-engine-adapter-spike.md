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

## Implemented
- Draft engine contract in `app/src/contracts/engine.ts`.
- Headless adapter in `app/src/engine-adapter/` with diagnostics for `generateRaw`, `generateRawData`, and `sendOpenAIRequest`.
- Vitest coverage proving the adapter delegates only to the headless exports and does not invoke `Generate()`.
- Draft character-card contract in `app/src/contracts/character.ts`.
- Pure JSON character-card parser in `app/src/parsers/`, covering the minimum V2/V3-like fields needed by the M0 import spike.

## Remaining M0 Verification
- Run the adapter inside the Vite app served from the same origin as SillyTavern and confirm the `@sillytavern/*` external URLs resolve.
- With user-provided API settings, trigger one real OpenAI-compatible generation and confirm whether streaming data can be consumed through the `sendOpenAIRequest` path.
- Inventory runtime import failures caused by missing legacy DOM nodes and decide between a minimal hidden compatibility layer or deeper engine extraction.
- Wire the character-card parser to a real file import flow and validate against PNG-embedded cards, not just JSON payloads.
