# Changelog

All notable changes to this project are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [semantic versioning](https://semver.org/). Each release lists the A2UI protocol version and the pinned versions of bitwrench and `@a2ui/web_core` it was tested with.

## Unreleased

Nothing yet.

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
