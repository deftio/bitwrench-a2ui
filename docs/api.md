# API reference

Everything below is exported from `bitwrench-a2ui` (npm) and available on the `bwA2UI` global in the script build. HTML export is also available from `bitwrench-a2ui/static`, and each transport from `bitwrench-a2ui/transport/<name>`.

## createRenderer(options)

Creates a renderer. Messages go in with `receive()`; everything the renderer has to tell the agent comes out through `send`.

```js
const renderer = createRenderer({
  mount: '#app',
  send: (message, metadata) => transport.send(message, metadata),
  onDiagnostic: d => console.debug(d),
  theme: 'ocean',
});
```

Options:

* **`mount`** - an element or CSS selector. Each surface gets a child `<div class="a2ui-surface">` inside it. Omit for headless use (inspection only).
* **`send(message, metadata)`** - called for every renderer-to-agent envelope: `action`, `error`, `callAgentFunction`, `rendererFunctionResponse`. `metadata` holds `a2uiRendererCapabilities` and, for surfaces created with `sendDataModel: true`, `a2uiRendererDataModel`. A throwing `send` is reported as a `SEND_FAILED` diagnostic.
* **`onDiagnostic(d)`** - local diagnostics: `{level, source, code, message, ...}` where `source` is `'process'` (message validation), `'surface'` (resolution and function errors, also sent to the agent) or `'render'` (adapter notes).
* **`catalogs`** - default `[createBasicCatalog()]`. Add custom catalogs here (see [Custom catalogs](custom-catalogs.md)).
* **`validation`** - `'strict'`, `'relaxed'`, or a web_core validation config object. Default: the core's own defaults. Strict rejects incomplete streams and a stray `theme`; relaxed tolerates missing roots and dangling references while a stream is arriving.
* **`theme`** - a bitwrench preset name (`'teal'`, `'ocean'`, `'sunset'`, `'forest'`, `'slate'`, `'rose'`, `'indigo'`, `'amber'`, `'emerald'`, `'nord'`, `'coral'`, `'midnight'`) or a bitwrench style config such as `{ primary: '#0b6e4f', radius: 'lg' }`, optionally with `preset`. See [Theming](theming.md).
* **`includeCapabilities`** - default `true`. Set `false` to leave capabilities out of `metadata`.
* **`bw`** - a bitwrench instance (default: the imported or global one).
* **`document`** - the document to render into (default: the global one).

### Renderer methods

The returned object has these members:

* **`receive(messages)`** - process one envelope, an array, or `{messages: [...]}`. Synchronous. Returns the processing error envelopes (they are also sent).
* **`receiveStream(source, {onMessage})`** - process JSONL from a string, an async iterable of chunks, or a `ReadableStream`. Bad lines are reported as `JSONL_PARSE` diagnostics and skipped.
* **`capabilities(options)`** - the `a2uiRendererCapabilities` object for your transport handshake.
* **`metadata()`** - the metadata the renderer attaches to outbound messages.
* **`surfaceIds()`** - ids of current surfaces.
* **`inspect(surfaceId)`** - `{surfaceId, catalogId, dataModel, viewTree, taco}`: a snapshot of the data model, the live view tree, and the composed TACO tree with handlers stripped.
* **`viewTree(surfaceId)`** - the live view tree: `{id, type, state, text?, value?, url?, name?, label?, isValid?, children?}`.
* **`host(surfaceId)`** - the surface's host element.
* **`surface(surfaceId)`** - the core's `SurfaceModel` (advanced).
* **`outbound()`** - the last 200 envelopes sent, oldest first.
* **`setTheme(theme)`** - re-theme all surfaces.
* **`setThemeMode(mode)`** - `'light'`, `'dark'` or `'auto'` (follows `prefers-color-scheme`). Returns the mode applied.
* **`reset()`** - delete all surfaces.
* **`destroy()`** - remove all DOM and release everything.
* **`processor`** - the underlying web_core `MessageProcessor` (advanced).
* **`debug`** - `rootView(id)`, `findView(componentId, id)`, `unmount(id)`. For tests, the playground and devtools; not a stable API.
* **`version`** - the A2UI protocol version (`'1.0'`). **`catalogId`** - the basic catalog id.

## Catalogs and components

Functions for building catalogs:

* **`createBasicCatalog({components, functions})`** - the v1.0 basic catalog with this package's implementations. Pass `components` to replace individual implementations (for example your own Button) and `functions` to add local functions.
* **`buildCatalog(json, implementations, functions)`** - a catalog from an A2UI catalog document. `implementations` maps component names to implementations; functions declared in the document without an implementation are routed to the agent.
* **`component(impl)`** - validates and returns a component implementation: `{render, update?, slots?, a11yTarget?, unmount?}`. See [Custom catalogs](custom-catalogs.md).
* **`makeFunction({name, execute, args, returnType, allowedCallers, requiresUserActivation, description})`** - a local function. `args` is JSON Schema; `execute(args, ctx)` receives the validated arguments and a context with `ctx.dataModel`.
* **`BASIC_COMPONENTS`** - the 18 implementations, by name.
* **`BASIC_CATALOG_DOCUMENT`** - the upstream basic catalog JSON document (schemas, descriptions and `instructions`), for building prompts or advertising the catalog to an agent.
* **`BASIC_CATALOG_ID`**, **`PROTOCOL_VERSION`**, **`VALIDATION`** - constants.
* **`normalizeMessage(msg, opts)`** - the envelope-key normalizer used internally (exported for agents and tests).

## Static HTML

From `bitwrench-a2ui` or `bitwrench-a2ui/static`:

* **`renderToHTML(messages, {surfaceId, theme, includeCss, catalogs, validation})`** - returns `{html, css, surfaces, errors, taco}`. Works in Node with no DOM.
* **`renderToDocument(messages, {title, lang, ...})`** - a complete HTML document with the CSS inlined.

## Transports

Helpers, all optional (see [Streaming and transports](streaming-and-transports.md)):

* **`JsonlDecoder`, `parseJsonl(text)`, `readJsonl(source)`** - JSONL framing.
* **`connectSSE(renderer, url, {event, EventSource, onError, withCredentials})`** - returns a close function.
* **`connectWebSocket(renderer, url, {protocols, WebSocket, onError})`** - returns `{send, close, socket}`; `send` fits the renderer's `send` option.
* **`fromA2A(message)`, `toA2APart(envelopes)`, `toA2AMessage(envelopes, metadata, ids)`, `A2A_EXTENSION_URI`, `A2A_EXTENSION_HEADER`** - the A2A extension.
* **`fromAgUiEvent(event)`, `connectAgUi(renderer, source)`** - AG-UI.
* **`isEnvelope(x)`, `collectEnvelopes(value)`, `A2UI_MIME_TYPE`** - recognizing envelopes in other payloads.

## Utilities

Also exported:

* **`markdownToTaco(md)`** - the Text Markdown renderer: `{content, block}`.
* **`safeMediaUrl(url)`, `isHttpUrl(url)`, `isSafeColor(color)`** - the policies the components use.
* **`themeCss(bw, theme)`, `resolveThemeConfig(bw, theme)`** - theme CSS for static pages.
* **`ICONS`, `ICON_VIEWBOX`** - the icon path data.
* **`viewTree(view)`** - builds a view tree from a view.
* **`VERSION`** - this package's version.
