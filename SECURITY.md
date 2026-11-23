# Security Policy

bitwrench-a2ui renders user interfaces described by AI agents. Agent output is untrusted input, so the renderer is built to keep the A2UI promise: an agent can describe UI, but it cannot run code in the page. This document explains what the renderer protects, what it leaves to you, and how to report a problem.

## Reporting a vulnerability

Please report security issues privately. Do not open a public issue for them.

* **GitHub** - use "Report a vulnerability" on the repository's Security tab (private vulnerability reporting).
* **What to include** - the version, a minimal message sequence or page that reproduces the problem, the browser or Node version, and what an attacker gains.
* **What happens next** - we acknowledge within a few days, agree on a fix and a disclosure date with you, and credit you in the release notes unless you prefer otherwise.

## Supported versions

Security fixes go into the latest release. The project is pre-1.0, so there are no long-term support branches yet.

| Version | Supported |
|---|---|
| 0.1.x | Yes |

## What the renderer protects

These guarantees hold for the components in this package and for anything rendered through its view layer:

* **No code from the wire** - messages can only select components and functions that the host registered in a catalog. Nothing in a message is evaluated as JavaScript. There is no `eval`, `new Function` or string event handler anywhere in the shipped code (the build checks this).
* **No raw HTML** - agent strings are placed in text nodes or in a fixed set of attributes. Text Markdown is parsed to a tree (quikdown's AST) and rebuilt from an allowlist of element types; raw HTML in Markdown stays visible text, and links and images render as plain text. bitwrench's raw-HTML escape hatch (`bw.raw`) is never used.
* **URL policy** - media URLs (Image, Video, AudioPlayer, poster) accept only `http:`, `https:`, `data:` and relative URLs, after stripping control characters; `javascript:`, `vbscript:`, `file:` and protocol-relative URLs render nothing. `openUrl` accepts absolute `http(s)` URLs only, requires a real user gesture, and opens with `noopener,noreferrer`.
* **No CSS from the wire** - v1.0 removed `theme` from messages; a stray `theme` is rejected (strict) or dropped (relaxed). Host theme colors are validated before reaching bitwrench's CSS generator.
* **Bounded input** - a message with more than 10,000 array items or nesting deeper than 64 levels is rejected before validation (configurable with `limits`), so a hostile message cannot exhaust memory or the stack in the validator.
* **Strict schemas** - every message is validated by `@a2ui/web_core` against the v1.0 schemas. Invalid messages are reported to the agent as `error` envelopes and do not change the UI.
* **Function boundaries** - `allowedCallers` and `requiresUserActivation` from the catalog are enforced by the core. Agent-only functions cannot be bound in the UI.
* **Isolation** - each surface has its own data model. `sendDataModel` data is attached only to messages for the agent that created the surface.
* **CSP friendly** - the browser builds need no `unsafe-eval` and no inline event handlers.

## What stays your responsibility

The renderer cannot know what your actions do. Please keep these in mind:

* **Authorize actions on the server** - an `action` from the renderer says what the user clicked and with what data. Treat it like any form post: authenticate the user and check permissions before acting on it.
* **Custom components** - components you register run with full page privileges. Build their TACO from typed values, never spread agent objects into attributes, and never pass agent strings to `bw.raw` or `innerHTML`.
* **Custom functions** - functions you register can be invoked by agent messages (within `allowedCallers`). Treat their arguments as untrusted.
* **Transport security** - use HTTPS/WSS and your normal authentication for the channel between the page and the agent.
* **Model output** - an LLM can be prompted into producing misleading UI (for example a fake login form). The renderer guarantees the UI cannot run code; it cannot guarantee the content is honest. Show agent-generated surfaces in a clearly labelled area of your app.
* **API keys** - the LLM sandbox page keeps keys in memory only: they are gone when you close or reload the tab, and are sent only to the provider you picked. Use restricted or development keys there.

## Dependencies

Runtime dependencies are pinned to exact versions: `@a2ui/web_core` (Google, Apache-2.0), `bitwrench` and `quikdown` (both BSD-2-Clause, same maintainer as this project). Upgrades are deliberate and gated on the full test and conformance suite. `dist/builds.json` records the exact versions and SRI hashes of every browser file. CI fails on any moderate or worse advisory in runtime dependencies, except ones reviewed and listed, with a reason, mitigation and expiry date, in `.github/audit-allowlist.json` (currently one: zod 3 inside web_core, see [docs/security.md](docs/security.md#known-limits)).
