# MCP Apps

MCP Apps let an MCP server return an interactive UI as a `ui://` HTML resource, which hosts such as Claude, ChatGPT and VS Code show in a sandboxed iframe. The sandbox usually allows no external scripts, so the whole app must be one HTML file. This page shows how to ship an A2UI surface that way with bitwrench-a2ui.

## Why this fits

The official guide inlines a framework renderer into one file with a bundler plugin. Here there is nothing to bundle: `dist/bitwrench-a2ui.bundle.min.js` already contains bitwrench and the renderer in one script, and the components need no external assets (icons are inline SVG).

## The template

`templates/mcp-app/` contains a single-file template and a build script:

```sh
npm run build
node templates/mcp-app/build.js my-surface.json --title "Booking" --theme ocean --host-origin https://host.example > my-app.html
```

The script inlines the bundle and your initial A2UI messages into `templates/mcp-app/template.html` and writes one HTML file to stdout, which your MCP server returns as the `ui://` resource. The messages file may hold one envelope, an array, or `{ "messages": [...] }` (the format of the upstream examples). All the flags are optional: the title defaults to "A2UI surface" and the theme to the `teal` preset.

Inside the page, the renderer is wired to the host with `postMessage`:

* **Ready** - once the initial messages render, the page posts `{ a2uiReady: true, capabilities }` to the parent, so the host can tell the agent what this renderer supports.
* **Origin** - the bridge talks only to the host origin: give it with `--host-origin https://host.example` at build time, or the page takes it from the embedding page when the browser exposes it (`location.ancestorOrigins`, then `document.referrer`). With no known origin the bridge stays closed; it never posts to `'*'`.
* **Incoming** - messages from the parent frame at the host origin (`event.source === window.parent` and `event.origin`; anything else is ignored) with an `a2ui` field are filtered through `collectEnvelopes`, so only valid v1.0 envelopes are passed to `renderer.receive()`.
* **Outgoing** - every renderer `send` is posted to the parent as `{ a2ui: message, metadata }`.

`test/dist/dist.test.js` builds the template from an upstream example and checks the ready message, the origin and source checks, and that the page loads no external scripts.

Adapt the bridge in the template to your host's MCP Apps API (tool calls, host context and its CSS variables) as needed; the template keeps it minimal and readable.

## Matching the host's look

Hosts may pass style tokens. Map them onto the renderer's CSS variables in the template's `<style>` element, for example:

```css
.a2ui-surface {
  --a2ui-color-primary: var(--host-accent, #2563eb);
  --a2ui-font-family: var(--host-font, system-ui);
}
```

## Security notes

The sandbox protects the host; the renderer protects the surface (see [Security](security.md)). Keep the bridge strict: accept messages only from the host origin your MCP client documents, and treat everything received as untrusted A2UI.
