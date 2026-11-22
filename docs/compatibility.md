# Compatibility

This page records what bitwrench-a2ui supports, how that is tested, and where it differs from the A2UI v1.0 specification or works around the published core. Every claim here has a test behind it in `test/`.

## Versions

The pinned versions for this release:

* **A2UI protocol** - v1.0 only. Earlier versions (v0.9.1, v0.9, v0.8) are out of scope.
* **Specification material** - `a2ui-project/a2ui` at commit `5ff1b05f` (2026-11-20), recorded in `test/upstream/PINNED_COMMIT`.
* **Core** - `@a2ui/web_core` 0.15.0, the latest release on npm.
* **Rendering** - bitwrench 2.1.15, unchanged. Markdown: quikdown 1.3.2.
* **Browsers** - modern evergreen browsers (ES2020). Node 22+ for npm use and static HTML.

## Conformance results

The upstream language-agnostic conformance suites run against this renderer in jsdom (`npm run test:conformance`):

| Suite | Cases | Passed | Skipped |
|---|---|---|---|
| `conformance/core/adapter_conformance.yaml` | 22 | 22 | 0 |
| `conformance/core/accessibility.yaml` | 7 | 7 | 0 |
| `conformance/adapter/markdown_subset.yaml` | 7 | 7 | 0 |

In addition, all 43 upstream basic catalog examples (`catalogs/basic/v1/examples`) render without errors, both live and as static HTML (`test/golden/`). The harness follows the official Lit renderer's harness, including outbound envelope validation against the v1.0 schema. Axe-core checks are approximated with the same structural checks the Lit harness uses, since jsdom has no layout engine.

Core conformance (`conformance/core/*` beyond the adapter suites) is web_core's responsibility and is tested upstream.

## Workarounds for web_core 0.15.0

The published core lags the v1.0 specification in a few places. The adapter works around each one; all are covered by tests and will be removed once a newer web_core is published and pinned:

* **`@` envelope keys** - 0.15 rejects the v1.0 spellings `@checks`, `@accessibility`, `@metadata` and `@catalogId` and accepts only the earlier bare keys. The adapter rewrites them before processing (unless a component sends both spellings, which the core then rejects as it should). Error paths may therefore name `checks` rather than `@checks`.
* **`theme` on createSurface** - v1.0 removed `theme`; the spec has strict renderers reject it and relaxed renderers drop it. 0.15 rejects it in every mode, so outside strict mode the adapter drops it and reports a `THEME_DROPPED` warning.
* **Agent functions** - the spec routes functions declared in a catalog without a renderer implementation to the agent with `callAgentFunction`. 0.15 reports them as "schema-only and has no implementation". The adapter provides an implementation that forwards the call through the core's public `callAgentFunction`, shares identical in-flight calls from bindings and checks (as the spec allows), and reports failures with the call's `functionCallId`.
* **Accessibility bindings on custom components** - for components from custom catalogs, 0.15 leaves bindings inside the accessibility envelope unresolved or not reactive. The adapter resolves them reactively.
* **Icon names bound with `@path`** - 0.15 passes a bound Icon `name` through unresolved; the adapter resolves it reactively.

## Known differences

Behavior to be aware of:

* **Removed optional properties persist** - with web_core 0.15, an `updateComponents` that leaves out an optional property a component had before (for example `placeholder`, `min` or `steps`) keeps the old value; the spec says an update replaces the definition in full. To clear a property, send an explicit empty value (for example `"placeholder": ""`).
* **Transient errors while streaming** - when components arrive before their data, functions that need the missing values report `EXPRESSION_ERROR` until the data arrives (the core sends these to the agent). Send data with or before the components to avoid them.
* **Static output is not hydrated** - when mounting the live renderer over server-rendered HTML, the live renderer replaces it.
* **Tabs and Modal state** - the selected tab and the modal's open state are local UI state, as the spec intends; they are not in the data model.
* **Icons** - Material Symbols are used. A few A2UI names map to the nearest symbol (`favorite`/`star` filled vs outlined for the `Off` variants, `payment` as credit card, `phone` as phone-enabled).
* **Size** - the browser build bundles web_core and its dependencies (zod and others), so it is not small; see `dist/builds.json` for exact numbers. A standalone zero-dependency core is planned.
