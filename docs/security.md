# Security

Agent output is untrusted input. A2UI's central promise is that an agent can describe UI without running code in the page, and the renderer is built to keep that promise inside bitwrench. The authoritative policy, including how to report a vulnerability, is in [SECURITY.md](../SECURITY.md); this page explains the design behind it.

## The trust model

Three parties are involved:

* **The agent** - untrusted. It may be a model that was prompted into misbehaving.
* **The host app** - trusted. It chooses the catalogs, functions and theme, and decides what actions do.
* **The renderer** - enforces the boundary between them.

## How the boundary is enforced

Each layer adds a check:

* **Size limits** - before validation, each message is measured: more than 10,000 array items in total, or nesting deeper than 64 levels, and it is rejected as `VALIDATION_FAILED` (the `limits` option changes the numbers). This bounds the memory and stack the validator can be made to use; see the zod note under Known limits. The JSONL decoder also caps lines at 4 MB.
* **Schema validation** - web_core validates every message against the v1.0 schemas, with no unknown keys allowed. Invalid messages change nothing and produce an `error` for the agent.
* **Catalog allowlist** - only component types and functions from catalogs the host registered can appear. Unknown types render nothing.
* **Components build their own markup** - each component constructs TACO from typed, resolved values. Agent strings only become text content or values of a fixed set of attributes. No agent object is ever spread into attributes.
* **No HTML strings** - Markdown is parsed to an AST and rebuilt from an allowlist. bitwrench's raw-HTML marker (`bw.raw`) is never used, and nothing is assigned to `innerHTML`.
* **URL policy** - media URLs must be `http(s)`, `data:` or relative (`src/render/safety.js`); `openUrl` must be absolute `http(s)`, needs a user gesture, and opens with `noopener,noreferrer`.
* **No styles from the wire** - `theme` is rejected or dropped; host colors are validated before they reach bitwrench's CSS generator, which does not escape values.
* **Handlers are functions** - event handlers are attached as functions, never as strings, and static output has none.
* **Function rules** - `allowedCallers` and `requiresUserActivation` are enforced by the core; actions run inside the native event handler, so gesture-gated functions cannot be triggered programmatically by a message.

## Tests that guard this

The test suite checks these properties directly: hostile URLs (`javascript:`, mixed case, embedded tabs, protocol-relative, backslashes), raw HTML and image or link syntax in Markdown, unsafe colors and SVG path data, static output with no `on*` attributes or scripts, the build containing no `eval` or `new Function`, and the upstream conformance case that blocks `openUrl` without a user gesture.

## Known limits

* **zod 3 in web_core** - `@a2ui/web_core` 0.15 validates with zod 3, which is affected by [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5): it keeps every issue of every failing array element, so one large invalid message could use hundreds of MB (we measured 116 MB for a 250 KB message of 20,000 invalid components). The fix is only in zod 4, which web_core 0.15 cannot use. The size limits above bound it; CI accepts this one advisory through a reviewed allowlist with an expiry date (`.github/audit-allowlist.json`), and the entry goes when web_core moves to zod 4.

Beyond that, some things the renderer cannot decide for you; see "What stays your responsibility" in [SECURITY.md](../SECURITY.md). In short: authorize actions on the server, write custom components with the same care as the built-in ones, and label agent-generated UI so users know where it came from.
