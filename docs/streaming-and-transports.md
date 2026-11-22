# Streaming and transports

A2UI does not define a transport; it needs ordered delivery, one envelope per frame, and a way to carry metadata. The renderer takes parsed envelopes in `receive()` and gives you outbound envelopes in `send`, so any channel works. This page covers the helpers for the common ones.

## The two directions

Every integration has the same shape:

* **Agent to renderer** - get envelopes from your channel and call `renderer.receive(envelope)` (or an array of them).
* **Renderer to agent** - in the `send(message, metadata)` callback, deliver `message` to the agent with `metadata` attached in whatever way your channel supports.

Progressive rendering is automatic: components can arrive in any order, and a child referenced before it exists appears as soon as it arrives. Use relaxed validation while streams are incomplete:

```js
createRenderer({ mount: '#app', validation: 'relaxed', send });
```

## JSONL

One envelope per line, the format agent SDKs and many HTTP endpoints stream:

```js
const response = await fetch('/agent/stream', { method: 'POST', body: prompt });
await renderer.receiveStream(response.body);
```

The decoder handles chunk boundaries anywhere (including inside multi-byte characters), CRLF, blank lines and a final line without a newline. Bad lines are reported as `JSONL_PARSE` diagnostics and skipped. `parseJsonl(text)` parses a complete string; `JsonlDecoder` is the incremental decoder.

## Server-Sent Events

```js
import { connectSSE } from 'bitwrench-a2ui';

const close = connectSSE(renderer, '/agent/events');       // one envelope (or array) per event
```

Send actions back with an ordinary POST in your `send` callback. Use `{event: 'a2ui'}` if your server uses a named event.

## WebSocket

```js
import { connectWebSocket, createRenderer } from 'bitwrench-a2ui';

let ws;
const renderer = createRenderer({ mount: '#app', send: (m, meta) => ws.send(m, meta) });
ws = connectWebSocket(renderer, 'wss://agent.example/a2ui');
```

Outbound frames are `{message, metadata}` when there is metadata, or the bare envelope otherwise. Messages sent before the socket opens are queued.

## A2A

The [A2UI A2A extension](https://github.com/a2ui-project/a2ui/tree/main/specification/v1_0/extensions/a2a) carries envelopes as DataParts with `mimeType: "application/a2ui+json"`, in both directions:

```js
import { A2A_EXTENSION_HEADER, fromA2A, toA2AMessage } from 'bitwrench-a2ui';

// incoming A2A message, task or artifact
renderer.receive(fromA2A(a2aResponse));

// outgoing: wrap actions and metadata as an A2A user message
const send = (message, metadata) => fetch(agentUrl, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...A2A_EXTENSION_HEADER },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'message/send', params: { message: toA2AMessage([message], metadata) } }),
});
```

The extension requires capabilities on every turn; `metadata` from the renderer already contains them.

## AG-UI and CopilotKit

The A2UI spec names AG-UI as a standard binding but does not fix where envelopes sit inside AG-UI events. Integrations such as CopilotKit carry them in custom events, tool results and state. `fromAgUiEvent(event)` extracts valid v1.0 envelopes from the fields those integrations use and ignores everything else; `connectAgUi(renderer, source)` subscribes a renderer to any event source with `subscribe()` or an async iterable.

```js
import { connectAgUi } from 'bitwrench-a2ui';

const stop = connectAgUi(renderer, agent.events);   // your AG-UI client's event stream
```

## MCP

For MCP tool results that contain A2UI, pass the result content to `collectEnvelopes()` and then to `receive()`. To ship a surface as an MCP App (`ui://` resource), see [MCP Apps](mcp-apps.md).

## Capabilities

Agents need to know which catalogs the renderer supports. `renderer.capabilities()` returns the `a2uiRendererCapabilities` object; the renderer also attaches it to `metadata` on every outbound message (turn off with `includeCapabilities: false`). Send it in your first request too, so the agent can choose catalogs before it renders anything.

## Data model sync

Surfaces created with `sendDataModel: true` have their whole data model attached to `metadata.a2uiRendererDataModel` on every outbound message, so the agent sees what the user typed even without an explicit action context. Typing alone never sends anything.
