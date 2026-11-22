# bitwrench in five minutes

bitwrench (https://github.com/deftio/bitwrench) is the small JavaScript UI library this renderer draws with. You do not need to know it to use bitwrench-a2ui, but knowing it helps you read the code, write custom components and style surfaces. This page covers the parts the renderer uses.

## UI as plain data

bitwrench describes UI as ordinary JavaScript objects called TACO, short for the four keys:

```js
const card = {
  t: 'div',                                   // tag
  a: { class: 'note', title: 'A note' },      // attributes
  c: [                                        // content: text, TACO, or arrays of them
    { t: 'h3', c: 'Hello' },
    { t: 'p', c: 'Plain objects, no templates.' },
  ],
  o: { mounted: el => console.log('in the DOM', el) },   // options: lifecycle, state
};
```

There is no template language, JSX or compiler. A TACO object can be built, inspected, stored, sent over the network and transformed like any other data. That makes bitwrench a natural host for A2UI, which is also UI as data.

## One object, two outputs

The same object renders to live DOM or to an HTML string:

```js
bw.mount('#app', card);          // live DOM (bw.DOM is the same function)
const html = bw.html(card);      // a string, works in Node with no DOM
```

Content is escaped by default in both. bitwrench-a2ui uses `bw.append` / `bw.mount` for the live renderer and `bw.html` for [static HTML](static-html.md).

## Updating in place

bitwrench has no virtual DOM and no automatic re-rendering. You change what changed:

```js
bw.patch(el, 'New text');                        // text content
bw.patch(el, { class: 'note active' });          // attributes
bw.patch(input, el => { el.value = 'typed'; });  // anything else, with a function
bw.replace(el, newTaco);                         // rebuild one element
```

The renderer relies on this. Each A2UI component is mounted once and then updated in place, so an input keeps its focus, caret and IME state while the agent changes other parts of the surface.

## Components: BCCL

bitwrench ships a component library (BCCL) of factory functions that return TACO:

```js
bw.makeCard({ content: 'Inside a card' });
bw.makeButton({ text: 'Save', variant: 'primary', onclick: save });
bw.makeInput({ type: 'email', placeholder: 'you@example.com' });
bw.makeCheckbox({ label: 'Agree', checked: true });
bw.makeRange({ min: 0, max: 10, value: 5, showValue: true });
```

The A2UI Card, Button, TextField, CheckBox and Slider are built on these factories, and the rest use plain TACO with BCCL class names, so everything shares one look.

## CSS as data, generated from a palette

bitwrench styles are generated from a few seed colors:

```js
const styles = bw.makeStyles({ primary: '#0b6e4f', secondary: '#6b7280' });
bw.applyStyles(styles, '#my-surface');   // scope the theme to one element
bw.toggleThemeMode('#my-surface');       // light / dark
```

`styles.palette` holds every derived color (hover, active, light, text-on-color, focus ring) for each role, and both a light and a dark palette are generated. Custom CSS is also written as objects with `bw.css`:

```js
bw.injectCSS(bw.css({
  '.badge': { padding: '2px 8px', 'border-radius': '999px', background: styles.palette.primary.light },
}), { id: 'my-badges' });
```

Because CSS is data, it composes: you can merge, override and scope rule objects at runtime. The renderer's [theming](theming.md) builds on this.

## What the renderer uses, and what it avoids

The renderer uses only bitwrench's documented, public APIs (`bw.append`, `bw.mount`, `bw.patch`, `bw.replace`, `bw.remove`, `bw.html`, `bw.css`, `bw.injectCSS`, `bw.makeStyles`, `bw.applyStyles`, `bw.make*`). It never modifies bitwrench, and it never uses `bw.raw` (bitwrench's raw-HTML escape hatch) because agent output must never become markup.

## Learn more

The bitwrench site has a full tutorial, API reference and live examples: https://deftio.github.io/bitwrench/pages/.
