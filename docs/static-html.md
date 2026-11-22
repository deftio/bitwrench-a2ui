# Static HTML

bitwrench renders the same UI description to live DOM or to an HTML string, and bitwrench-a2ui inherits that. `renderToHTML()` turns A2UI messages into HTML without a browser. This page covers what it is for and how it behaves.

## Usage

```js
import { renderToHTML, renderToDocument } from 'bitwrench-a2ui/static';

const { html, css, errors } = renderToHTML(messages, { theme: 'ocean' });
// html: <div class="a2ui-surface" data-surface-id="...">...</div>
// css:  theme and component CSS for that markup

const page = renderToDocument(messages, { title: 'Order summary' });
// page.html: a complete document with the CSS inlined
```

Options:

* **`surfaceId`** - render only one surface (default: all, in creation order).
* **`theme`** - same as the renderer's `theme` option.
* **`includeCss`** - prepend a `<style>` element to `html`.
* **`catalogs`**, **`validation`** - as for `createRenderer`.

The result also includes `surfaces` (ids rendered), `errors` (any error envelopes) and `taco` (the composed TACO trees, useful for tests).

## What you get

The output is the first frame of each surface, with no behavior attached:

* **Values** - bindings, formatted text and inputs show their current data-model values.
* **No handlers, no scripts** - event handlers are removed before rendering; the output contains no inline `on*` attributes and no `<script>`.
* **Escaped content** - agent strings are escaped; raw HTML in Markdown appears as text.
* **Closed overlays** - Tabs show the first tab; Modal content is not rendered.
* **Same components** - the markup comes from the same component code as the live renderer, so CSS that styles one styles the other.

## Uses

Where static output helps:

* **Snapshots and transcripts** - store what the user saw alongside a chat log or support ticket.
* **Previews** - show a non-interactive preview of a surface, for example in a notification or a list of recent results.
* **Server-side first paint** - send HTML first, then mount the live renderer over it when the scripts load (the live renderer replaces the static markup; it does not hydrate it in place).
* **Email-style output** - `renderToDocument` produces a self-contained page. Email clients vary in CSS support, so test with yours.
* **Tests** - golden-file tests of agent output in Node, with no browser.

## Data that arrives later

If an agent sends components before data, functions that need missing data report errors until the data arrives. For static output, send the data with `createSurface` (or before the components), so the snapshot is complete.
