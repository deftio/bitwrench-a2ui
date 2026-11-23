# bitwrench-a2ui documentation

bitwrench-a2ui renders A2UI, Google's open protocol for agent-generated user interfaces, in plain JavaScript using bitwrench. These pages explain how to use it and how it works, assuming no prior knowledge of A2UI or bitwrench.

The documents are plain Markdown and read well on GitHub. The same files are also rendered on the project site at https://deftio.github.io/bitwrench-a2ui/pages/docs.html.

## Start here

Read these first, in order:

* **[Quick start](quick-start.md)** - render your first A2UI surface in a plain HTML page, then from npm.
* **[A2UI in five minutes](a2ui-in-five-minutes.md)** - the protocol: surfaces, components, the data model, bindings, actions.
* **[bitwrench in five minutes](bitwrench-primer.md)** - the UI library underneath: UI and CSS as plain JavaScript data.

## Using the renderer

Guides for building with it:

* **[API reference](api.md)** - every exported function and option.
* **[Components](components.md)** - the 18 basic catalog components, their properties and how they render.
* **[Custom catalogs](custom-catalogs.md)** - add your own components and functions.
* **[Theming](theming.md)** - presets, seed colors, light and dark, CSS variables, composing styles as data.
* **[Streaming and transports](streaming-and-transports.md)** - JSONL, SSE, WebSocket, A2A, AG-UI, and sending actions back.
* **[Static HTML](static-html.md)** - render surfaces to HTML strings for snapshots, previews and SSR.
* **[MCP Apps](mcp-apps.md)** - ship a surface as a single-file `ui://` resource.
* **[Using with LLMs](using-with-llms.md)** - prompting a model to produce A2UI, and the LLM sandbox page.

## How it works

For contributors and the curious:

* **[How it works](how-it-works.md)** - the architecture: web_core, the adapter, views and slots, reactivity, static composition.
* **[Security](security.md)** - the trust model and what is protected.
* **[Compatibility](compatibility.md)** - conformance results and known differences, including the web_core 0.16.1 upgrade and the one gap the adapter still works around.
* **[Testing](testing.md)** - the unit, conformance, golden and dist test suites.
* **[FAQ](faq.md)** - common questions.
