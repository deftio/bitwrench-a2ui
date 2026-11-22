# Testing

The test suite is how the project backs up its claims: conformance results, security properties and 100% coverage are all checked on every run. This page describes the suites and how to run them.

## Commands

All suites use Node's built-in test runner with jsdom:

```sh
npm test                 # everything
npm run test:coverage    # everything, with the 100% coverage gate on src/
npm run test:conformance # only the upstream conformance suites
npm run build            # needed before the dist tests
```

## The suites

What each folder covers:

* **`test/unit/`** - every module: components (each property, variant and update path, focus and caret preservation), the renderer API, transports, Markdown, URL and color policies, theming, static export, the core wrapper and edge cases of the component contract.
* **`test/conformance/`** - a harness that runs the pinned upstream YAML suites (`test/upstream/conformance/`) against the renderer. It drives real DOM events (input, change, clicks, keyboard), validates every outbound envelope against the v1.0 schema, checks view identity, disposal and subscription counts, and writes an executed-case manifest when `A2UI_CONFORMANCE_MANIFEST_DIR` is set. Unsupported cases must be listed with a reason; the list is currently empty, and stale entries fail the run.
* **`test/golden/`** - all 43 upstream basic catalog examples, rendered live and as static HTML.
* **`test/dist/`** - loads the built browser files into a page with `<script>` semantics and renders a surface, for both the two-script setup and the single-file bundle; checks `builds.json` and the third-party license file. It also runs every page in `examples/` and `pages/` with its real scripts and fails on any script error, and builds and exercises the MCP App template.

## Coverage

`npm run test:coverage` fails unless lines, branches, functions and statements are all at 100% for `src/` (generated data files excluded). If a line really cannot be reached in tests, mark it with a `c8 ignore` comment that states why; there are none today.

## Upstream material

`test/upstream/` holds pinned copies of the A2UI conformance suites, basic catalog examples, JSON schemas and schema test cases, with the upstream Apache-2.0 license. Do not edit them by hand; see "Updating the upstream pin" in [CONTRIBUTING.md](../CONTRIBUTING.md).
