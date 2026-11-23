# Compatibility

This page records what bitwrench-a2ui supports, how that is tested, and where it differs from the A2UI v1.0 specification or works around the published core. Every claim here has a test behind it in `test/`.

## Versions

The pinned versions for this release:

* **A2UI protocol** - v1.0 only. Earlier versions (v0.9.1, v0.9, v0.8) are out of scope.
* **Specification material** - `a2ui-project/a2ui` at commit `7a776e7a` (2026-11-23), the commit `@a2ui/web_core` 0.16.1 was released from, recorded in `test/upstream/PINNED_COMMIT`. The spec, catalog, examples and conformance files are byte-for-byte the same as at the previous pin, `5ff1b05f`.
* **Core** - `@a2ui/web_core` **0.16.1**, the latest release on npm (published 2026-11-23). Before bitwrench-a2ui 0.9.4 the renderer used 0.15.0; see below for what the upgrade changed.
* **Rendering** - bitwrench 2.1.15, unchanged. Markdown: quikdown 1.3.2.
* **Browsers** - modern evergreen browsers (ES2020). Node 22+ for npm use and static HTML.

## Conformance results

The upstream language-agnostic conformance suites run against this renderer in jsdom (`npm run test:conformance`):

| Suite | Cases | Passed | Skipped |
|---|---|---|---|
| `conformance/core/adapter_conformance.yaml` | 22 | 22 | 0 |
| `conformance/core/accessibility.yaml` | 7 | 7 | 0 |
| `conformance/adapter/markdown_subset.yaml` | 7 | 7 | 0 |

These results are with web_core 0.16.1 and are unchanged from 0.15.0. In addition, all 43 upstream basic catalog examples (`catalogs/basic/v1/examples`) render without errors, both live and as static HTML (`test/golden/`). The harness follows the official Lit renderer's harness, including outbound envelope validation against the v1.0 schema. Axe-core checks are approximated with the same structural checks the Lit harness uses, since jsdom has no layout engine.

Core conformance (`conformance/core/*` beyond the adapter suites) is web_core's responsibility and is tested upstream.

## Workarounds for web_core 0.16.1

One gap remains between the published core and the v1.0 specification. The adapter works around it, with tests, until a web_core release fixes it:

* **`theme` on createSurface** - v1.0 removed `theme`; the spec has strict renderers reject it and relaxed renderers drop it. web_core 0.16.1 still rejects it in every mode, so outside strict mode the adapter drops it and reports a `THEME_DROPPED` warning.

### Removed with the upgrade to 0.16.1

web_core 0.16 fixed the other gaps the adapter used to work around for 0.15.0, so these workarounds are gone. Each behavior is now the core's own, and the same tests and upstream suites pass:

* **`@` envelope keys** - the core reads `@checks`, `@accessibility`, `@metadata` and `@catalogId` itself, and rejects a component that sends both spellings of one key. The adapter no longer rewrites them, so error paths name the `@` keys.
* **Agent functions** - the core routes a call to a function a catalog declares without an implementation to the agent with `callAgentFunction`, shares identical in-flight calls from bindings and checks, and caches answers per surface. The adapter's own forwarding layer is gone. `renderToHTML` has no agent, so such a call is reported as an `EXPRESSION_ERROR` in its `errors`.
* **Accessibility bindings on custom components, and bound Icon names** - the core resolves these reactively. `ctx.read()` stays available for bindings a custom component finds inside its own free-form props.
* **Message copies** - the core now copies the data it is given. The renderer still hands it copies of each message and sends snapshots, so a host's message log, fixtures and sent actions never change (see the 0.9.4 notes in the CHANGELOG).

### Behavior changes from web_core 0.16 that hosts may notice

* **Actions are sent asynchronously** - the core resolves an action's context as a promise, so `send` receives the action a microtask after the click rather than during it.
* **Stricter validation** - a `TextField` must have `value`; `DynamicBoolean` values are coerced as the spec says (`"true"` is true, other strings are false; numbers are `value !== 0`); `regex` patterns must use the portable A2UI regex dialect, without lookbehind, backreferences or nested unbounded quantifiers; undeclared function arguments are rejected.
* **Updates replace definitions in full** - a property left out of an `updateComponents` is removed (see below).

## Known differences

Behavior to be aware of:

* **Transient errors while streaming** - when components arrive before their data, functions that need the missing values report `EXPRESSION_ERROR` until the data arrives (the core sends these to the agent). Send data with or before the components to avoid them.
* **Static output is not hydrated** - when mounting the live renderer over server-rendered HTML, the live renderer replaces it.
* **Tabs and Modal state** - the selected tab and the modal's open state are local UI state, as the spec intends; they are not in the data model.
* **Icons** - Material Symbols are used. A few A2UI names map to the nearest symbol (`favorite`/`star` filled vs outlined for the `Off` variants, `payment` as credit card, `phone` as phone-enabled).
* **Size** - the browser build bundles web_core and its dependencies (zod among them), so it is not small: about 140 KB gzipped for the renderer script, of which this adapter is about 30 KB; see `dist/builds.json` for exact numbers. A standalone zero-dependency core is planned.
* **zod advisory** - web_core 0.16.1 still uses zod 3, so the renderer keeps its size limits on incoming messages (GHSA-mrhx-c7xc-m3w5; see [Security](security.md#known-limits)).
