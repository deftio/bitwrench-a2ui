# A2UI in five minutes

A2UI (Agent-to-User Interface) is an open protocol, published by Google at https://a2ui.org, for agents to describe user interfaces as data. The agent sends JSON messages; a renderer on the user's side draws them with its own trusted components and sends the user's actions back. This page covers version 1.0, the only version this renderer supports.

## Why it exists

An agent that wants to show a form, a booking summary or a chart has two bad options: send prose and hope, or send code and trust it. A2UI is a third option. The agent sends a description built only from components the client has agreed to support, so the client can render it natively, style it to match the app, and never run agent code.

## The pieces

Five ideas cover almost everything:

* **Surface** - one independent piece of UI, identified by a `surfaceId`. A chat can show several surfaces at once.
* **Components** - a flat list of nodes, each with an `id`, a `component` type and properties. Containers point at children by id. The component with `id: "root"` is the top of the tree.
* **Catalog** - the set of component types and functions a renderer supports, identified by a `catalogId` URL. Every renderer supports the *basic catalog* of 18 components.
* **Data model** - a JSON document per surface. Component properties can bind to it with JSON Pointer paths, and inputs write to it.
* **Actions** - when the user clicks a button, the renderer sends an `action` message back to the agent with values read from the data model.

## The messages

The agent sends four kinds of message to build and change UI (plus two for function calls):

```json
{"version": "1.0", "createSurface": {
  "surfaceId": "booking",
  "catalogId": "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json",
  "dataModel": {"guests": 2},
  "components": [
    {"id": "root", "component": "Column", "children": ["title", "guests", "book"]},
    {"id": "title", "component": "Text", "text": {"@call": "formatString", "args": {"value": "# Table for ${/guests}"}}},
    {"id": "guests", "component": "Slider", "label": "Guests", "min": 1, "max": 8, "value": {"@path": "/guests"}},
    {"id": "book", "component": "Button", "child": "bookLabel",
     "action": {"event": {"name": "book", "context": {"guests": {"@path": "/guests"}}}}},
    {"id": "bookLabel", "component": "Text", "text": "Book"}
  ]}}
```

The message types:

* **`createSurface`** - start a surface, optionally with its components and data in the same message.
* **`updateComponents`** - add or replace components by id. Components may arrive in any order; a child referenced before it exists simply shows once it arrives.
* **`updateDataModel`** - set a value at a JSON Pointer path (`"path": "/guests", "value": 4`), replace the whole model (no path), or delete a key (`"value": null`).
* **`deleteSurface`** - remove a surface.
* **`callRendererFunction`** and **`agentFunctionResponse`** - function calls between agent and renderer (advanced).

## Values: literals, bindings and calls

Most properties accept three forms:

* **A literal** - `"text": "Hello"`.
* **A binding** - `"text": {"@path": "/user/name"}` reads from the data model and updates live. Inside a list template, paths without a leading slash are relative to the current item.
* **A function call** - `{"@call": "formatString", "args": {"value": "Hi ${/user/name}"}}`. The basic catalog has functions for formatting (`formatString`, `formatNumber`, `formatCurrency`, `formatDate`, `pluralize`), validation (`required`, `regex`, `length`, `numeric`, `email`), logic (`and`, `or`, `not`) and `openUrl`.

Inputs (TextField, CheckBox, ChoicePicker, Slider, DateTimeInput) bind their `value` two ways: typing writes to the data model immediately, and every other binding to that path updates. Nothing is sent to the agent until an action fires.

## Lists from data

A container's `children` can be a template instead of a list of ids:

```json
{"id": "list", "component": "List", "children": {"componentId": "row", "path": "/items"}}
{"id": "row", "component": "Text", "text": {"@path": "name"}}
```

The renderer creates one `row` per entry in `/items`, each bound to its own item.

## Validation

Interactive components can carry `@checks`, a list of conditions with messages. A failing check shows its message next to the control and disables Buttons that carry it; warnings and info show as hints without blocking.

```json
{"id": "email", "component": "TextField", "label": "Email", "value": {"@path": "/email"},
 "@checks": [{"condition": {"@call": "email", "args": {"value": {"@path": "/email"}}}, "message": "Please enter a valid email."}]}
```

## Going back to the agent

The renderer sends these messages to the agent:

* **`action`** - a user action, with `name`, `surfaceId`, `sourceComponentId`, a `timestamp` and the resolved `context`.
* **`error`** - something in the agent's messages was invalid (with a JSON path when possible).
* **`callAgentFunction`** / **`rendererFunctionResponse`** - function calls (advanced).

Alongside messages, the transport carries metadata: the renderer's capabilities (which catalogs it supports) and, for surfaces created with `sendDataModel: true`, the surface's current data model.

## What A2UI does not do

A2UI does not define a transport (SSE, WebSocket, A2A, AG-UI and MCP are all used), does not carry styles (v1.0 removed `theme`; the app styles surfaces), and does not let agents send code. The [specification](https://a2ui.org/specification/v1.0-a2ui/) has the full details.
