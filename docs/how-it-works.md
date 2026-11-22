# How it works

This page explains the architecture of bitwrench-a2ui: what the A2UI core does, what the bitwrench adapter does, and how a message becomes pixels and a click becomes a message. Read [A2UI in five minutes](a2ui-in-five-minutes.md) and [bitwrench in five minutes](bitwrench-primer.md) first if the terms are new.

## The big picture

There are three layers, each with one job:

```text
 agent messages                                           to the agent
      │                                                         ▲
      ▼                                                         │
┌───────────────────────────────────────────────────────────────┴──┐
│ @a2ui/web_core (Google's A2UI core, pinned)                       │
│  MessageProcessor → SurfaceModel → NodeResolver → ComponentNode   │
│  validation, data model, bindings, functions, templates, RPC      │
└───────────────────────────────┬───────────────────────────────────┘
                                │ resolved node tree (signals)
┌───────────────────────────────▼───────────────────────────────────┐
│ bitwrench-a2ui adapter                                             │
│  surface hosts → Views (mount once, update in place) → slots       │
│  18 basic components as TACO / BCCL, theme, accessibility         │
└───────────────────────────────┬───────────────────────────────────┘
                                │ bw.append / bw.patch / bw.html
┌───────────────────────────────▼───────────────────────────────────┐
│ bitwrench (pinned, unchanged)                     DOM or HTML text │
└────────────────────────────────────────────────────────────────────┘
```

* **The core** - `@a2ui/web_core` is the shared engine behind Google's React, Lit and Angular renderers. It parses and validates messages, keeps each surface's components and data model, resolves bindings and function calls, expands list templates, tracks placeholders for components that have not arrived, and handles function calls in both directions. Its output is a tree of `ComponentNode` objects whose `props` are already resolved.
* **The adapter** - this package. It draws that tree with bitwrench, forwards user input and clicks back into the core, maps accessibility attributes, applies the theme and reports everything the core emits to your `send` callback.
* **bitwrench** - renders TACO objects to DOM or to HTML strings.

The design follows A2UI's own [framework adapter blueprint](https://github.com/a2ui-project/a2ui/blob/main/blueprints/modules/a2ui_framework_adapter.blueprint.md), using its "stateful instances" form, which fits bitwrench's mount-once-then-patch model.

## From message to DOM

When you call `renderer.receive(message)`:

1. **Normalize** - `src/core/webcore.js` rewrites v1.0 `@`-prefixed envelope keys to the spellings web_core 0.15 accepts, and drops a stray `theme` outside strict mode (see [Compatibility](compatibility.md)).
2. **Process** - the core validates the message and updates its state. Invalid messages come back as `error` envelopes, which the renderer sends to the agent.
3. **Surface created** - for a new surface, the renderer creates a host element (`<div class="a2ui-surface">`), applies the theme to it, and creates a `NodeResolver`, which produces the live node tree.
4. **Root view** - when the root node exists, a `View` is created for it.
5. **Views all the way down** - each view mounts its component once and creates child views for the children its component places in slots.

## Views

A `View` (`src/render/view.js`) owns one rendered component instance. It keeps the same DOM element for its whole life unless the component's type changes.

* **Keyed by instance** - a view is keyed by the core's `instanceId`, which names a component at a data scope. In a list template, each item gets its own instance.
* **One effect per view** - the view runs a reactive effect over the node's `props`. The first run mounts the component (`render()` → TACO → `bw.append`); later runs call the component's `update()` to patch the element in place.
* **Re-binding** - when a placeholder's component arrives, or a component's definition changes, the core replaces the node object behind the same `instanceId`. The view switches to the new node instead of being recreated, so the parent is not remounted and the child appears in place.
* **Not resolved** - pending, unknown and cyclic nodes render nothing and take no layout space; the core reports unknown types and cycles to the agent.

## Slots and children

Components place their children in named slots. A Card has one slot, a Row has `children`, a Tabs has a `panel` slot holding only the selected tab's child, and a Modal has `trigger` and `content` slots (content only while open).

* **Placeholder in TACO** - a component's `render()` calls `ctx.slot('children', {...})`, which returns an empty element marked as a slot.
* **Holders** - for each child node, the view creates a small holder element in the slot and a child view inside it. Holders let a child be pending, hidden, reordered or replaced without touching its siblings.
* **Minimal moves** - on each update, children are matched by `instanceId`: removed ones are disposed, new ones mounted, and existing ones moved only if their position changed.
* **Weights** - for Row and Column, holders are flex items, so a child's `weight` becomes `flex-grow` on its holder.

## Two-way binding and actions

Input flows back through the core, never around it:

* **Typing** - a TextField's `input` event calls the `value` binding's `set()`. The core writes the data model and every binding to that path re-resolves. The typing field itself is not re-rendered; its `update()` sees the value already matches and leaves the element alone, so the caret never jumps.
* **Clicking** - a Button calls the resolved action closure synchronously inside the native click handler. That matters: functions such as `openUrl` require a real user gesture, which only holds during the native event.
* **Sending** - the core turns an `event` action into an `action` payload; the renderer wraps it in a v1.0 envelope and calls your `send` with capability and data-model metadata.

## Reactivity

The core uses signals internally. The adapter does not add a second reactive system:

* **Per-view effects** - each view's effect reads `node.props`. When the core changes them, the effect re-runs and patches the DOM.
* **Raw values** - for the few values the core leaves unresolved (an Icon `name` bound with `@path`, accessibility bindings on custom-catalog components), `ctx.read()` reads the data model through a signal, so those update live too.
* **No whole-surface redraws** - an update touches only the components whose props changed.

## Static composition

`renderToHTML()` runs the same core headless and walks the node tree with `compose()`. Each component's `render()` is called with a static context: `ctx.slot()` returns the child TACO inline instead of an empty placeholder, and `ctx.on()` returns no handlers. The tree goes through `bw.html()`. Live rendering and static rendering use the same component code, so they cannot drift apart.

## Where things live

A map of the source:

* **`src/core/webcore.js`** - the only file that imports web_core: catalogs, the normalizer, agent-function routing, processor setup.
* **`src/core/interface.js`** - small helpers for reading node props.
* **`src/render/view.js`** - views, slots, accessibility, static composition.
* **`src/catalog/basic/components.js`** - the 18 components.
* **`src/render/markdown.js`** - Text Markdown via quikdown's AST.
* **`src/render/safety.js`** - URL and color policies.
* **`src/theme/theme.js`** - theme resolution, CSS variables and adapter CSS.
* **`src/renderer.js`** - `createRenderer()`: surfaces, outbound envelopes, metadata, inspection.
* **`src/static/index.js`** - HTML export.
* **`src/transport/`** - JSONL, SSE, WebSocket, A2A, AG-UI.

## A standalone core, later

Every web_core import sits in `src/core/webcore.js`, and the adapter reads nodes through a small interface. A planned standalone build will swap web_core for a zero-dependency core behind the same interface, tested against the same suites. See the design notes in [dev/bitwrench-a2ui-spec.md](../dev/bitwrench-a2ui-spec.md).
