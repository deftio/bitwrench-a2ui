# Quick start

This page gets an A2UI surface on screen in a few minutes. The first example needs nothing but an HTML file; the second uses npm.

## In a plain HTML page

Save this as `hello.html` and open it in a browser. There is no build step and no framework.

```html
<!doctype html>
<html>
<body>
  <div id="app"></div>

  <script src="https://cdn.jsdelivr.net/npm/bitwrench@2.1.15/dist/bitwrench.umd.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/bitwrench-a2ui@0.1.0/dist/bitwrench-a2ui.min.js"></script>
  <script>
    const renderer = bwA2UI.createRenderer({
      mount: '#app',
      send: message => console.log('to the agent:', message),
    });

    renderer.receive({
      version: '1.0',
      createSurface: {
        surfaceId: 'hello',
        catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
        dataModel: { name: 'Ada' },
        components: [
          { id: 'root', component: 'Column', children: ['greeting', 'name', 'go'] },
          { id: 'greeting', component: 'Text',
            text: { '@call': 'formatString', args: { value: '# Hello, ${/name}' } } },
          { id: 'name', component: 'TextField', label: 'Your name', value: { '@path': '/name' } },
          { id: 'go', component: 'Button', child: 'goLabel', variant: 'primary',
            action: { event: { name: 'submit', context: { name: { '@path': '/name' } } } } },
          { id: 'goLabel', component: 'Text', text: 'Submit' },
        ],
      },
    });
  </script>
</body>
</html>
```

What you should see and try:

* **A heading** - "Hello, Ada", produced by the `formatString` function from the data model.
* **Two-way binding** - type in the field and the heading updates as you type. Nothing is sent anywhere yet.
* **An action** - click Submit and the console shows the `action` message the renderer would send to your agent, with the current name in its `context`.

Two script tags are loaded. The first is bitwrench, the UI library. The second is this renderer, which includes Google's A2UI core and exposes the `bwA2UI` global. Both are pinned to exact versions; pin yours too, and add the `integrity` hashes listed in `dist/builds.json` of each release.

For a single file instead of two, use `dist/bitwrench-a2ui.bundle.min.js`, which contains both.

## From npm

The npm package ships its ES module source, so any bundler or Node 22+ can use it directly.

```sh
npm install bitwrench-a2ui
```

```js
import { createRenderer } from 'bitwrench-a2ui';

const renderer = createRenderer({
  mount: document.querySelector('#app'),
  send: (message, metadata) => fetch('/agent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, metadata }),
  }),
});

const response = await fetch('/agent/start');
renderer.receive(await response.json());
```

`send` receives every message the renderer produces for the agent (actions, errors, function calls) plus `metadata` to carry alongside it: the renderer's capabilities, and the data model for surfaces created with `sendDataModel: true`.

## Rendering to HTML in Node

The same components can produce an HTML string, with no browser involved:

```js
import { renderToHTML } from 'bitwrench-a2ui/static';

const { html, css } = renderToHTML(messages, { theme: 'ocean' });
```

See [Static HTML](static-html.md).

## Next steps

Where to go from here:

* **[A2UI in five minutes](a2ui-in-five-minutes.md)** - understand the messages you just sent.
* **[Playground](https://deftio.github.io/bitwrench-a2ui/pages/playground.html)** - edit messages and watch them render, step by step.
* **[Streaming and transports](streaming-and-transports.md)** - connect to a real agent.
