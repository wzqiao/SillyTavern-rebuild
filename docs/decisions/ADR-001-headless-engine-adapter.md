# ADR-001: Use a Headless Engine Adapter Boundary

## Status
Proposed

## Date
2026-06-09

## Context
ST-Reforged needs to reuse SillyTavern's generation engine while replacing the jQuery-era UI with a Vue 3 SPA. The PRD identifies `Generate()` and many surrounding modules as DOM-heavy, while `generateRaw`, `generateRawData`, and `sendOpenAIRequest` are the closest available pure-data seams for M0.

## Decision
All new Vue-side modules will call a typed `HeadlessEngineAdapter` contract instead of importing SillyTavern engine files directly. The adapter may lazy-load `@sillytavern/script` and `@sillytavern/scripts/openai`, but it must not call `Generate()` or manipulate SillyTavern DOM/jQuery state.

## Alternatives Considered

### Direct Imports From Stores Or Views
- Pros: Fast to prototype.
- Cons: Leaks SillyTavern globals and DOM coupling into the new app.
- Rejected: It breaks the PRD's interface-first and adapter isolation rules.

### Hidden DOM Compatibility Layer First
- Pros: Could make more of the existing engine run unchanged.
- Cons: Locks the new UI into legacy DOM shape before M0 proves it is necessary.
- Rejected for now: Keep as a fallback if headless seams fail.

### Copy Engine Code Into `app/`
- Pros: Easier local typing and refactoring.
- Cons: Diverges from upstream and violates the external import strategy.
- Rejected: The hard fork should still avoid unnecessary engine duplication.

## Consequences
- `app/src/contracts/engine.ts` becomes the draft API that stores, services, and future UI modules consume.
- `app/src/engine-adapter/` is the only new Vue-side location that imports `@sillytavern/*` engine modules.
- M0 verification can report missing exports and DOM-coupling risks through adapter diagnostics instead of failing deep inside UI code.
