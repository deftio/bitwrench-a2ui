# Changelog

All notable changes to this project are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [semantic versioning](https://semver.org/). Each release lists the A2UI protocol version and the pinned versions of bitwrench and `@a2ui/web_core` it was tested with.

## Unreleased

**Upgraded to `@a2ui/web_core` 0.16.1** (released 2026-11-23), from 0.15.0, and moved the upstream spec pin to `a2ui-project/a2ui@7a776e7a`, the commit 0.16.1 was released from (the pinned spec, catalog, examples and conformance files are unchanged). All 36 upstream suite cases and all 43 examples pass as before.

* **Four workarounds removed** - web_core now handles the v1.0 `@` envelope keys, routes calls to catalog functions without an implementation to the agent, resolves custom-catalog accessibility bindings and bound Icon names reactively, and removes properties left out of an `updateComponents`. The adapter's own versions of these are gone; `normalizeMessage` now only drops `createSurface.theme` (still rejected by 0.16.1) and leaves `@` keys alone. Removed properties are now actually removed (a known difference with 0.15).
* **Behavior changes from web_core 0.16** - actions reach `send` a microtask after the click (the core resolves the action context asynchronously); a `TextField` must have `value`; `DynamicBoolean` values are coerced as the spec says; `regex` patterns must use the portable A2UI dialect; undeclared function arguments are rejected. See [compatibility](docs/compatibility.md).
* **Static rendering and agent functions** - `renderToHTML` has no agent, so a function that needs one is reported once in `errors` (`EXPRESSION_ERROR`) instead of being silently dropped. Identical errors are listed once.
* **Smaller dependency tree** - web_core 0.16 drops `redos-detector`; the renderer bundle stays about 140 KB gzipped, as the core itself grew.
* **zod** - web_core 0.16.1 still uses zod 3 (forcing zod 4 fails 73 of our 278 tests), so the size limits and the reviewed advisory exception stay.

Fixed:

* **Received and sent messages are never modified** - `@a2ui/web_core` keeps the data-model objects of `createSurface` and `updateDataModel` and writes user edits into them, so a host's message log, fixtures or replay buffer changed as the user typed (seen in the site inspector, where the original `createSurface` showed the typed name). The renderer and `renderToHTML` now hand web_core copies, taken after the size check. Outbound messages, `renderer.outbound()` and the `a2uiRendererDataModel` metadata are snapshots too, so a logged action keeps the values it was sent with. The copies use `structuredClone`, or a JSON round trip where it is missing (jsdom).
* **Gallery media plays** - the Video and AudioPlayer entries used placeholder `example.invalid` URLs; they now play small files made for the site with ffmpeg (`pages/media/`, no third-party content).

Docs and site:

* **Claims match the evidence** - "36/36" is described as the pinned upstream adapter, accessibility and Markdown suites (renderer suites, not all of A2UI core conformance), with the accessibility checks named as structural checks in jsdom; coverage is labelled as `src/` coverage; "no build step" means none on your side; static HTML is a snapshot, not hydrated; "matches the official renderers" now says the core is shared and links the documented adaptations; "Safe by construction" became "Declarative, catalog-controlled", with the measures listed, and the security docs no longer make absolute guarantees.
* **UI as objects, explained first** - the README, the home page and "How it works" introduce bitwrench's objects for UI and CSS (TACO) with a small runnable example before using the term, and point to the site's own source as an example.
* **Inspector** - the home page and playground show the received wire JSON, the messages sent to the agent, the data model and the UI objects as separate, explained tabs ("UI objects (TACO)"); the home page has a "Watch a stream" button.
* **Size** - the README gives measured sizes: about 30 KB gzipped for this adapter, the rest of the 140 KB being web_core with zod and redos-detector, plus 48 KB for bitwrench.

## 0.9.3 - 2026-11-23

Security:

* **Media URL trimming in linear time** - `safeMediaUrl` trimmed controls and spaces with an end-anchored regex that took quadratic time on a long run of spaces (about 3.6 s for 100,000), so an agent could stall the page with one oversized URL. It now trims with a loop (CodeQL `js/polynomial-redos`).
* **Dependency exceptions for Scorecard** - `osv-scanner.toml` records the reviewed advisories with reasons and expiry dates: zod (runtime, mitigated by the size guard) and glob and minimatch (inside the coverage tool only, never in the package).
* **`SECURITY.md`** - links the private reporting form, and lists 0.9.x as the supported line.

Tooling:

* **Local site server** - `tools/serve.js` checks and reads each file through one open handle (CodeQL `js/file-system-race`).
* **Conformance report** - feature titles escape backslashes as well as `|` in the Markdown table (CodeQL `js/incomplete-sanitization`).
* **Docs page** - `pages/docs.html` takes the document id from the site's own list before fetching it (CodeQL `js/client-side-request-forgery`; the id was already checked against that list).
* **Release script** - waits up to 10 minutes for npm to serve a new version: npm accepts a publish, then takes a few minutes to process it.

Credits: the 0.9.3 security fixes were done with Claude (Anthropic) as a coding assistant, reviewed and released by the maintainer.

## 0.9.2 - 2026-11-23

0.9.1 was tagged but never reached npm: npm 12 read the workflow's tarball path as a GitHub repository. 0.9.2 is the first release with the 0.9.1 changes on npm.

Release process:

* **Publishing** - `publish.yml` passes the tarball to `npm publish` as `./release/…`, a file path (npm 12 read `release/…` as a GitHub shorthand and refused it: `EALLOWGIT`).
* **Fix and run again** - while the release PR is open, a fix committed on your branch is just another `npm run release`: it rebuilds the release from `HEAD` and force-pushes it to the PR. A release branch left on GitHub without an open PR is replaced instead of stopping the release.
* **Release script hardening** - the release worktree lives in a private temporary directory, and versions are fully escaped in regular expressions (CodeQL findings).
* **Rulesets** - the release pre-flight checks that GitHub enforces `.github/rulesets/` and offers to apply them (`tools/github-settings.sh`); they had never been applied, so no check was required on `main`.

Credits: the 0.9.2 release-process work was done with Claude (Anthropic) as a coding assistant, reviewed and released by the maintainer.

## 0.9.1 - 2026-11-23

Security:

* **Message size limits** - every agent message is measured before `@a2ui/web_core` validates it, and rejected as `VALIDATION_FAILED` when it has more than 10,000 array items in total or nests deeper than 64 levels. This bounds GHSA-mrhx-c7xc-m3w5 in zod 3 (inside web_core 0.15), where a 250 KB message of 20,000 invalid components used 116 MB of memory. New `limits` option on `createRenderer` and `renderToHTML`; new exports `checkLimits` and `DEFAULT_LIMITS`.
* **Runtime audit allowlist** - CI fails on any moderate or worse advisory in runtime dependencies unless it is listed in `.github/audit-allowlist.json` with a reason, a mitigation and an expiry date (`tools/audit.js`).

Release process:

* **Releases go through a pull request** - `npm run release` builds a fresh worktree, bumps the version, runs the full CI locally, opens a release PR, waits for the required checks, merges it, tags the merge commit, follows the publish workflow, and approves a staged npm version in the terminal. Re-running with the version resumes a release that stopped.
* **One CI definition** - `npm run ci` (`tools/ci.js`) runs exactly the checks of `ci.yml`, which now calls it, as does the publish workflow on the tag.
* **`publish.yml`** - the tag workflow is renamed from `release.yml`, and publishes to npm with trusted publishing (OIDC) only.

Credits: the 0.9.1 security and release work was done with Claude (Anthropic) as a coding assistant, reviewed and released by the maintainer.

## 0.9.0 - 2026-11-22

First public release, a pre-1.0 preview: the API may still change before 1.0. A2UI v1.0 renderer for plain JavaScript, built on bitwrench.

Pins: A2UI spec `a2ui-project/a2ui@5ff1b05f`, `@a2ui/web_core` 0.15.0, bitwrench 2.1.15, quikdown 1.3.2.

Added:

* **Renderer** - `createRenderer()` with surfaces, theming (bitwrench presets and seed colors, light and dark), inspection (`inspect`, `viewTree`), JSONL streaming and capability metadata.
* **Basic catalog** - all 18 v1.0 components implemented with bitwrench and BCCL, including accessibility mapping, validation feedback, and focus-preserving updates.
* **Markdown** - Text Markdown through quikdown's AST, rendered from an allowlist with no HTML strings.
* **Custom catalogs** - `buildCatalog()`, `component()` and `makeFunction()` for host components and functions; schema-only functions are routed to the agent.
* **Static HTML** - `renderToHTML()` and `renderToDocument()` for snapshots, previews and server-side rendering.
* **Transports** - JSONL, SSE, WebSocket, A2A extension and AG-UI helpers.
* **Builds** - script-tag build (`bwA2UI` global), browser ESM build, single-file bundle, `builds.json` with SRI hashes, third-party licenses.
* **Site** - home page, playground, component gallery, examples, LLM sandbox (Claude, Gemini or OpenAI with your own key) and documentation, all built with bitwrench.
* **Examples** - hello world, a validated form, JSONL streaming, a custom catalog, multiple surfaces, Node static export, and a dependency-free SSE agent server.
* **MCP Apps** - `templates/mcp-app` builds a single-file `ui://` resource with a postMessage bridge.
* **Conformance report** - `npm run conformance:report` maps each upstream renderer feature id to the cases that pass.

Conformance: all 36 cases of the pinned upstream suites pass (`core/adapter_conformance.yaml`, `core/accessibility.yaml`, `adapter/markdown_subset.yaml`), and all 43 upstream basic catalog examples render live and as static HTML.

Works around these gaps in `@a2ui/web_core` 0.15.0 (see docs/compatibility.md):

* **`@` envelope keys** - normalizes `@checks`, `@accessibility`, `@metadata` and `@catalogId` to the spellings 0.15 accepts.
* **`theme` on createSurface** - dropped (with a warning) outside strict mode, as the spec asks of relaxed renderers.
* **Agent functions** - schema-only catalog functions are routed to the agent with `callAgentFunction`, sharing identical in-flight reactive calls.
* **Custom-catalog accessibility bindings** - resolved reactively by the adapter.
* **Bound Icon names** - `{"@path"}` icon names resolved reactively by the adapter.
