// Helpers for defining component implementations and catalogs.
//
// A component implementation is a plain object:
//
//   {
//     render(p, ctx)            -> TACO for the component's root element (required)
//     update(el, p, ctx, prev)  -> patch el in place; return false to re-render instead
//     slots(p, ctx)             -> { slotName: node | node[] } children to mount in slots
//     a11yTarget(el)            -> element that receives aria-* from @accessibility
//     unmount(el, ctx)          -> release anything render/update attached outside el
//   }
//
// `p` holds the core's resolved props: literals, bindings ({value} or writable
// {value,set}), child nodes and action closures. `ctx` provides:
//   ctx.live          true in the browser, false when composing static HTML
//   ctx.slot(name, {tag, attrs, item, itemAttrs})  placeholder for a child slot
//   ctx.on(fn)        fn when live, undefined when static (event handlers)
//   ctx.id(suffix)    a unique DOM id for this instance
//   ctx.state         per-instance local state (for example the selected tab)
//   ctx.refresh()     re-run update() after changing local state (live only)
//   ctx.read(raw)     reactive read of a raw {"@path"} the core left unresolved
//   ctx.p             current props (use inside event handlers)
//   ctx.bw            bitwrench

/** Validate and return a component implementation. */
export function component(impl) {
  if (!impl || typeof impl.render !== 'function') {
    throw new TypeError('component(): an implementation needs a render(p, ctx) function');
  }
  for (const k of ['update', 'slots', 'a11yTarget', 'unmount']) {
    if (impl[k] !== undefined && typeof impl[k] !== 'function') {
      throw new TypeError(`component(): "${k}" must be a function`);
    }
  }
  return impl;
}
