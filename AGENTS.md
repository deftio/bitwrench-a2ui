# AGENTS.md

Notes for coding agents (and people) working in this repository.

## What this is

An A2UI v1.0 renderer. `@a2ui/web_core` does protocol work (message processing, data model, expressions, validation); this repository is the view layer that turns web_core's component nodes into DOM with bitwrench, plus static HTML rendering, transports, the site and the docs.

## Layout

* **`src/core/webcore.js`** - the only file that imports `@a2ui/web_core`. Catalog building, message normalization, and the workarounds for web_core 0.15 gaps (see `docs/compatibility.md`).
* **`src/render/view.js`** - `View`: one per component node; mounts, updates in place or re-renders, manages child slots.
* **`src/catalog/basic/components.js`** - the 18 basic catalog components as `{ render, update?, slots? }` objects that return TACO (`{t, a, c, o}`).
* **`src/renderer.js`** - `createRenderer`, the public browser API.
* **`src/static/`** - `renderToHTML` / `renderToDocument`.
* **`src/transport/`** - JSONL, SSE, WebSocket, A2A and AG-UI helpers.
* **`src/theme/`** - theme presets to `--a2ui-*` CSS variables.
* **Generated, do not edit** - `src/catalog/basic/catalog-json.js` (`npm run sync:upstream`), `src/catalog/basic/icons.js` (`tools/fetch-icons.js`), `docs/conformance-report.md` (`npm run conformance:report`), `dist/` (`npm run build`).
* **`test/upstream/`** - pinned copies of upstream fixtures; refresh with `npm run sync:upstream`, never by hand.

## Commands

```sh
npm run build           # dist/ (required before test/dist)
npm test                # all tests
npm run test:coverage   # 100% lines/branches/functions/statements gate on src/
npm run test:conformance
npm run conformance:report
npm run pages           # local site
```

## Rules

* Keep coverage at 100% with no `c8 ignore` comments. Add a test with every change in `src/`.
* Agent output is untrusted: never set `innerHTML` from message content; URLs go through `src/render/safety.js`; Markdown goes through the allowlist in `src/render/markdown.js`.
* Keep Lit out of the bundles (the build checks). Import web_core only from `src/core/webcore.js`, and only from `@a2ui/web_core/v1_0`.
* Dependencies are pinned to exact versions. Discuss before adding one.
* Node 22+. Plain ES modules, no TypeScript, no transpile step for `src/`.
