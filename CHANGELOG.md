# Changelog

All notable changes to this project are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [semantic versioning](https://semver.org/). Each release lists the A2UI protocol version and the pinned versions of bitwrench and `@a2ui/web_core` it was tested with.

## Unreleased

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
