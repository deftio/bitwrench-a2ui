# Phase 0 spike results

Date: November 22, 2026  
Pinned: `@a2ui/web_core` 0.15.0, `bitwrench` 2.1.15, `quikdown` 1.3.2, esbuild 0.28.2, jsdom 26.1.0, Node 22.5.1 (local)  
Upstream catalog: `upstream/basic_catalog_v1.json`, copied from `a2ui-project/a2ui` at the commit in `upstream/PINNED_COMMIT`

The spike answers the four go/no-go questions from section 20 of the spec with running code. All four pass, so the web_core build goes ahead.

## How to run

The spike has two scripts:

* **`node --no-warnings dev/spike/run.js`** - bundle, Node and CSP checks (Q1, Q2, Q4).
* **`node --no-warnings dev/spike/q3-dom.js`** - the bitwrench rendering check under jsdom (Q3). Exits non-zero on any failure.

## Results

Each question, with what the code showed:

* **Q1, Lit excluded from the bundle** - pass, with one condition. No bytes from Lit or web_core's `universal` layer reach the output, and nothing calls `customElements.define`. The condition: component schemas must come from `Catalog.fromJson(catalog.json)`. Importing `TextApi`, `ButtonApi` and the rest instead pulls in about 22 KB of Lit, because those names are re-exported through web_core's components barrel, which builds the Lit elements when the module loads.
* **Q2, Node with no DOM** - pass. `MessageProcessor` and `NodeResolver` run headless. formatString resolves (`Hello, Ada!`), writing through a `WritableBinding` updates both the data model and other bindings (`Hello, Grace!`), and a Button action produces a correct v1.0 `action` with resolved context. This makes `renderToHTML` in Node practical.
* **Q3, Form 4 instances with bitwrench** - pass, 14 of 14 checks. Initial render, pending child renders nothing, typing writes through the binding, other bindings update, an unrelated agent update leaves the focused input's element, focus and caret untouched with zero remounts, an agent write to the input's own path updates its value in place, a late child upgrades in place in the right order, the button sends the action, and teardown empties the DOM.
* **Q4, strict CSP** - pass. No `eval`, `new Function` or `Function("...")` in the bundled output.

## Findings that change the design

These go into the spec and the adapter:

* **Schemas from JSON** - the default build loads the basic catalog's schemas with `Catalog.fromJson` from the pinned official `catalog.json`, and pairs them with our implementations and web_core's `BASIC_FUNCTIONS`. We never import the `*Api` component objects.
* **Views re-bind by instanceId** - when a placeholder's component arrives, web_core replaces the node object under the same `instanceId`. A view keyed by `instanceId` must switch to the new node. The first spike run missed this and failed two checks, which the adapter blueprint (section 6, step 5) describes.
* **Upstream improvement** - the components barrel could mark its element construction as pure, or web_core could export the component APIs from a Lit-free entry point. A small issue or PR upstream would help other non-Lit adapters.
* **Node version** - local Node is 22.5.1. jsdom 27 and later need Node 22.12 or later (their dependencies use `require` of ES modules), so the spike pins jsdom 26.1.0. Moving to Node 22 LTS latest or 24 LTS would allow current jsdom. JSON module imports also print an experimental warning on 22.5.1, which `--no-warnings` hides.

## Bundle composition (min, before gzip)

For reference only. Size is not a goal.

| Package | Bytes in output |
|---|---|
| `@a2ui/web_core` | 235,956 |
| `redos-detector` | 67,529 |
| `zod` | 59,692 |
| `(local, incl. catalog.json)` | 25,952 |
| `zod-to-json-schema` | 20,366 |
| `@preact/signals-core` | 4,762 |
| Total | 415,293 min, 114,782 gzip |

web_core 0.16 (not yet on npm) replaces `redos-detector` with an in-house regex checker, which should remove about 67 KB.
