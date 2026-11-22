# Custom catalogs

A catalog is the contract between your app and the agent: the component types and functions your renderer supports. The basic catalog covers common UI; a custom catalog adds your own, such as a stat card, a chart or a product tile. This page shows how to write one.

## The catalog document

A catalog is described by a JSON document in the A2UI catalog format. It is what you advertise to the agent (and what an agent SDK turns into prompt instructions), so describe properties clearly.

```js
const dashboardJson = {
  catalogId: 'https://example.com/catalogs/dashboard/v1.json',
  protocolVersion: '1.0',
  components: {
    StatCard: {
      type: 'object',
      description: 'A labelled number with an optional trend.',
      properties: {
        component: { const: 'StatCard' },
        label: { $ref: 'common_types.json#/$defs/DynamicString' },
        value: { $ref: 'common_types.json#/$defs/DynamicString' },
        trend: { type: 'string', enum: ['up', 'down', 'flat'] },
      },
      required: ['component', 'label', 'value'],
    },
  },
  functions: {
    toCelsius: {
      type: 'object',
      returnType: 'number',
      properties: { '@call': { const: 'toCelsius' }, args: { type: 'object', properties: { value: { $ref: 'common_types.json#/$defs/DynamicNumber' } }, required: ['value'] } },
      required: ['@call', 'args'],
    },
  },
};
```

Use `$ref: 'common_types.json#/$defs/...'` for bindable values (`DynamicString`, `DynamicNumber`, `DynamicBoolean`), child references (`ComponentId`, `ChildList`) and actions (`Action`). The core resolves those before your component sees them.

Validation is strict: a component may only carry the properties its schema declares (plus the `@accessibility`, `@checks`, `@metadata` and `@catalogId` envelope). If agents should be able to give your component a flex `weight` inside a Row or Column, declare it, as the basic catalog does for each of its components: `weight: { type: 'number' }`.

## Component implementations

An implementation turns resolved properties into bitwrench TACO:

```js
import { component } from 'bitwrench-a2ui';

const StatCard = component({
  render(p, ctx) {
    return ctx.bw.makeStatCard
      ? ctx.bw.makeStatCard({ label: p.label.value, value: p.value.value })
      : { t: 'div', a: { class: 'stat' }, c: [
          { t: 'div', a: { class: 'stat-label' }, c: p.label.value },
          { t: 'div', a: { class: 'stat-value' }, c: p.value.value },
        ] };
  },
  update(el, p) {
    el.querySelector('.stat-value, .bw_stat_value').textContent = p.value.value;
    return true;               // handled in place; return false to re-render
  },
});
```

The implementation contract:

* **`render(p, ctx)`** (required) - return TACO for the root element. `p` holds resolved props: bindings arrive as `{value}` (or `{value, set}` for two-way), child references as nodes, actions as functions.
* **`update(el, p, ctx, prev)`** - patch `el` for new props and return `true`, or return `false` to have the view re-render. Without `update`, every change re-renders.
* **`slots(p, ctx)`** - `{slotName: node or nodes}`: which children go in which slot. Default: `children` and `child`.
* **`a11yTarget(el)`** - the element that should receive `aria-label` and `aria-description` (for example the inner `<input>`). Default: the root.
* **`unmount(el, ctx)`** - release anything you attached outside `el` (timers, observers, global listeners).

The context:

* **`ctx.slot(name, {tag, attrs, item, itemAttrs})`** - a placeholder for a child slot. `item: 'box'` makes each child a block wrapper (needed for flex weights); the default wraps children with no box of their own.
* **`ctx.on(fn)`** - wrap event handlers with this, so static HTML export gets none.
* **`ctx.p`** - current props, for use inside event handlers (they outlive the render that created them).
* **`ctx.state`**, **`ctx.refresh()`** - local UI state (for example a selected tab) and a way to re-run `update()` after changing it.
* **`ctx.id(suffix)`** - a unique DOM id for this instance, for `label for`, `aria-controls` and similar.
* **`ctx.read(raw)`** - reactive read of a raw `{"@path"}` value.
* **`ctx.bw`** - bitwrench. **`ctx.live`** - `false` when composing static HTML.

Rules worth following: build TACO from typed values; never spread an agent object into `a`; never pass agent strings to `bw.raw`; put handlers through `ctx.on`; and do not rebuild a focused input in `update()`.

## Children

To render children, call `ctx.slot()` in `render` and list the nodes in `slots`:

```js
const Panel = component({
  render: (p, ctx) => ({ t: 'section', a: { class: 'panel' }, c: [
    { t: 'h4', c: p.title.value },
    ctx.slot('body', { attrs: { class: 'panel-body' } }),
  ] }),
  slots: p => ({ body: p.child }),
});
```

## Functions

Local functions run in the browser:

```js
import { makeFunction } from 'bitwrench-a2ui';

const toCelsius = makeFunction({
  name: 'toCelsius',
  returnType: 'number',
  args: { type: 'object', properties: { value: { $ref: 'common_types.json#/$defs/DynamicNumber' } }, required: ['value'] },
  execute: ({ value }) => Math.round((value - 32) * 5 / 9),
});
```

Declare arguments with the dynamic types (`DynamicNumber`, `DynamicString`, `DynamicBoolean`, `DynamicValue`) so agents can pass bindings such as `{"@path": "/tempF"}`; the core resolves them, and `execute` receives plain values. A bare `{ type: 'number' }` only accepts literals.

Functions declared in a catalog document with no implementation are routed to the agent with `callAgentFunction`, and the binding or action waits for the agent's `agentFunctionResponse`. Identical in-flight calls from bindings and checks are shared; actions always make a fresh call.

## Putting it together

```js
import { buildCatalog, createBasicCatalog, createRenderer } from 'bitwrench-a2ui';

const dashboard = buildCatalog(dashboardJson, { StatCard }, [toCelsius]);
const renderer = createRenderer({ mount: '#app', catalogs: [createBasicCatalog(), dashboard] });
```

A surface can mix catalogs: set the surface's `catalogId` to the default, and give individual components `@catalogId` to take them from another catalog.

## Replacing a basic component

To restyle a single basic component with your own implementation, pass it to `createBasicCatalog`:

```js
createBasicCatalog({ components: { Button: MyButton } });
```

The schema stays the basic catalog's; only the rendering changes.
