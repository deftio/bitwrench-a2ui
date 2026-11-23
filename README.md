# bitwrench-a2ui

[![npm](https://img.shields.io/npm/v/bitwrench-a2ui)](https://www.npmjs.com/package/bitwrench-a2ui)
[![CI](https://github.com/deftio/bitwrench-a2ui/actions/workflows/ci.yml/badge.svg)](https://github.com/deftio/bitwrench-a2ui/actions/workflows/ci.yml)
[![CodeQL](https://github.com/deftio/bitwrench-a2ui/actions/workflows/codeql.yml/badge.svg)](https://github.com/deftio/bitwrench-a2ui/actions/workflows/codeql.yml)
[![A2UI](https://img.shields.io/badge/A2UI-v1.0-4f46e5)](https://a2ui.org/)
[![conformance](https://img.shields.io/badge/conformance-36%2F36-16a34a)](docs/conformance-report.md)
[![coverage](https://img.shields.io/badge/coverage-100%25-16a34a)](docs/testing.md)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

**An [A2UI](https://a2ui.org/) v1.0 renderer for plain JavaScript, built on [bitwrench](https://github.com/deftio/bitwrench).** Add one script tag to show the interfaces your agent sends, with no framework and no build step. The same renderer also produces HTML strings in Node.

[Site](https://deftio.github.io/bitwrench-a2ui/) · [Playground](https://deftio.github.io/bitwrench-a2ui/pages/playground.html) · [Components](https://deftio.github.io/bitwrench-a2ui/pages/gallery.html) · [LLM sandbox](https://deftio.github.io/bitwrench-a2ui/pages/llm.html) · [Docs](docs/README.md)

## What it is

A2UI is Google's open protocol for agent-generated UI. An agent does not send HTML or code; it sends JSON that describes components (a Column, a TextField, a Button) from a catalog the client trusts. A *renderer* turns those messages into native UI and sends the user's actions back.

bitwrench-a2ui is that renderer for the plain web:

* **Protocol** - A2UI **v1.0**, the basic catalog (all 18 components and 14 functions), custom catalogs, and the full set of agent and renderer messages.
* **Core** - it is built on Google's [`@a2ui/web_core`](https://www.npmjs.com/package/@a2ui/web_core), the same message processor, data model and validation that the official Lit, React and Angular renderers use. bitwrench-a2ui is the view layer on top of it.
* **Conformance** - it passes all 36 cases of the upstream conformance suites and renders all 43 upstream basic catalog examples; see the [conformance report](docs/conformance-report.md).
* **Rendering** - bitwrench represents UI and CSS as plain JavaScript objects. Each A2UI component becomes such an object, is mounted, and updates in place as data arrives. That same object can be turned into an HTML string, which is how [static rendering](docs/static-html.md) works.
* **Delivery** - one script tag (or two, with bitwrench separate), or `npm install`. No framework, no custom elements, no build step required.

## Supported versions

| | Supported |
|---|---|
| A2UI protocol | **v1.0** (earlier drafts such as v0.8 and v0.9 are not supported) |
| Catalog | Basic catalog v1.0, plus host-registered custom catalogs |
| Browsers | Current evergreen browsers (the builds target ES2020) |
| Node | 22 or newer, for the npm package and static rendering |

## Quick start

Save this as `hello.html` and open it:

```html
<div id="app"></div>
<script src="https://cdn.jsdelivr.net/npm/bitwrench@2.1.15/dist/bitwrench.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/bitwrench-a2ui@0.9.2/dist/bitwrench-a2ui.min.js"></script>
<script>
  const renderer = bwA2UI.createRenderer({
    mount: '#app',
    send: message => console.log('to the agent:', message),   // actions, errors, function calls
  });

  renderer.receive({
    version: '1.0',
    createSurface: {
      surfaceId: 'hello',
      catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
      dataModel: { name: 'Ada' },
      components: [
        { id: 'root', component: 'Column', children: ['greeting', 'name', 'go'] },
        { id: 'greeting', component: 'Text', text: { '@call': 'formatString', args: { value: '# Hello, ${/name}' } } },
        { id: 'name', component: 'TextField', label: 'Your name', value: { '@path': '/name' } },
        { id: 'go', component: 'Button', child: 'goLabel', action: { event: { name: 'submit', context: { name: { '@path': '/name' } } } } },
        { id: 'goLabel', component: 'Text', text: 'Submit' },
      ],
    },
  });
</script>
```

When you type in the field, the heading updates. When you click Submit, the console shows the `action` message the renderer would send to your agent.

From npm:

```sh
npm install bitwrench-a2ui
```

```js
import { createRenderer } from 'bitwrench-a2ui';
import { connectSSE } from 'bitwrench-a2ui/transport/sse';

const renderer = createRenderer({
  mount: '#app',
  send: (message, metadata) => fetch('/agent/action', { method: 'POST', body: JSON.stringify({ message, metadata }) }),
});
connectSSE(renderer, '/agent/events');
```

To render in Node, without a browser:

```js
import { renderToHTML } from 'bitwrench-a2ui/static';
const { html, css } = renderToHTML(messages);
```

The [quick start](docs/quick-start.md) covers each of these in more detail.

## Builds

| File | Use |
|---|---|
| `dist/bitwrench-a2ui.min.js` | Script tag, after `bitwrench.umd.min.js`; global `bwA2UI` |
| `dist/bitwrench-a2ui.bundle.min.js` | Single script tag with bitwrench included |
| `dist/bitwrench-a2ui.esm.min.js` | Browser ES module |
| `src/` (npm) | ES module source for bundlers and Node |

Each release's `dist/builds.json` lists exact sizes, the pinned dependency versions, and `integrity` hashes for subresource integrity. About 140 KB gzipped for the renderer, most of which is the A2UI core and its validator. None of the builds contains Lit.

## Documentation

You do not need to know A2UI or bitwrench to start:

* **Start** - [Quick start](docs/quick-start.md), [A2UI in five minutes](docs/a2ui-in-five-minutes.md), [bitwrench in five minutes](docs/bitwrench-primer.md).
* **Use** - [API](docs/api.md), [components](docs/components.md), [custom catalogs](docs/custom-catalogs.md), [theming](docs/theming.md), [streaming and transports](docs/streaming-and-transports.md), [static HTML](docs/static-html.md), [MCP Apps](docs/mcp-apps.md), [using with LLMs](docs/using-with-llms.md).
* **Understand** - [how it works](docs/how-it-works.md), [security](docs/security.md), [compatibility](docs/compatibility.md) (including known differences), [testing](docs/testing.md), [conformance report](docs/conformance-report.md), [FAQ](docs/faq.md).
* **Examples** - [`examples/`](examples/): hello world, a validated form, JSONL streaming, a custom catalog, multiple surfaces, static export, and an SSE agent server.

## Security

Agent output is treated as untrusted. Only catalog components render, text is never parsed as HTML, Markdown is rendered from an allowlist, URLs and colors are checked, and functions that need a user gesture (such as `openUrl`) only run after one. Read [docs/security.md](docs/security.md) for the trust model and [SECURITY.md](SECURITY.md) to report a vulnerability.

## Development

```sh
npm install
npm run build          # dist/
npm test               # unit, conformance, golden and dist tests
npm run test:coverage  # the same, with the 100% coverage gate CI uses
npm run pages          # the site at http://localhost:8080/pages/
```

See [CONTRIBUTING.md](CONTRIBUTING.md). Upstream test fixtures are pinned to an A2UI commit and refreshed with `npm run sync:upstream`.

## Built with

* **[bitwrench](https://github.com/deftio/bitwrench)** - UI and CSS as JavaScript data, and the component library (BCCL) the basic catalog is drawn with.
* **[@a2ui/web_core](https://github.com/a2ui-project/a2ui)** - Google's A2UI message processing, data model, expressions and validation (Apache-2.0).
* **[quikdown](https://github.com/deftio/quikdown)** - the Markdown parser behind the `Text` component and the docs pages.

## License

Licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for third-party notices. A2UI is an open project started by Google; this is an independent, community renderer, not an official Google product.
