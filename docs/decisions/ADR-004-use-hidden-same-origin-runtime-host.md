# ADR-004: Use a Hidden Same-Origin Runtime Host for SillyTavern Inspection

## Status
Accepted

## Date
2026-06-09

## Context
ST-Reforged keeps the new Vue app separate from SillyTavern's legacy jQuery UI while still reusing the engine seams documented in ADR-001. Same-origin browser testing showed that directly importing `@sillytavern/script` from the Vue page executes SillyTavern modules outside their expected host page and can hit legacy top-level DOM assumptions.

The legacy `public/lib.js` entry is also not browser-consumable source. In normal SillyTavern, `/lib.js` is served by the backend's Webpack middleware as a bundled module. Reforged's dev path must therefore load runtime modules from a real same-origin SillyTavern backend, not from copied or rewritten source.

## Decision
Runtime inspection loads a hidden same-origin iframe at `/__st_runtime/`, which Vite proxies to the real SillyTavern backend root. SillyTavern boots inside its own legacy page and provides the expected runtime globals and DOM.

The Reforged adapter then injects a small module bridge into that same-origin frame to read `script.js` and `scripts/openai.js` exports. It may expose `globalThis.SillyTavern.getContext` as the adapter's `getContext` probe seam, but it must not call DOM-heavy `Generate()` or manipulate SillyTavern's jQuery DOM.

Vite dev proxy must forward `/__st_runtime/`, `/script.js`, `/lib.js`, `/lib/*`, `/scripts/*`, static runtime assets, `/csrf-token`, and `/api/*` to the real SillyTavern origin. `/lib.js` must be the backend Webpack output.

## Alternatives Considered

### Import SillyTavern modules directly in the Vue page
- Pros: Simpler adapter code.
- Cons: Runs legacy top-level DOM assumptions outside the SillyTavern page and can freeze or fail the Reforged UI.
- Rejected: It weakens the adapter boundary and made runtime inspection brittle.

### Recreate only the missing globals in Vue
- Pros: Avoids iframe startup cost.
- Cons: Gradually reimplements SillyTavern's legacy DOM contract inside Reforged.
- Rejected: The compatibility surface would expand unpredictably.

### Bundle or alias SillyTavern's npm libraries in Reforged
- Pros: Fixes the first bare-import failure.
- Cons: Moves SillyTavern's `/lib.js` Webpack responsibility into the Vue app and would require chasing many package aliases.
- Rejected: Reforged should consume the real runtime artifact served by the ST backend.

## Consequences
- Runtime inspect can verify real same-origin SillyTavern exports without storing API keys or calling `Generate()`.
- The hidden frame is a compatibility boundary, not a UI integration path. Reforged views and stores still talk only to contracts and `engine-adapter`.
- Real OpenAI-compatible sends remain on the adapter-owned direct backend seam from ADR-003, not on legacy settings mutation.
- Future production hosting should either serve Reforged from the SillyTavern origin or provide an equivalent same-origin runtime host route.
