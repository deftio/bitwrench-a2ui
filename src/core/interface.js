// The small interface the adapter depends on, independent of which core produced it.
//
// A node (ComponentNode in web_core) exposes:
//   instanceId  stable id of a component at a data scope (key for view identity)
//   componentId the wire component id
//   type        component type name ('Text', 'Button', ...)
//   state       'resolved' | 'pending' | 'unknown-type' | 'cyclic'
//   dataPath    JSON Pointer of the node's data scope (for relative bindings)
//   props       a signal of resolved props: literals, bindings ({value} or {value,set}),
//               child nodes, and action closures
//   impl        the catalog entry the core chose; our implementation lives on impl.bw
//
// The helpers here read those shapes without importing the core.

/** True for a core node object. */
export function isNode(v) {
  return !!v && typeof v === 'object' && typeof v.instanceId === 'string';
}

/** Unwrap a resolved binding ({value} / {value,set}) to its value; pass literals through. */
export function val(v) {
  if (v && typeof v === 'object' && !Array.isArray(v) && 'value' in v && !isNode(v)) return v.value;
  return v;
}

/** True when the prop is a two-way binding. */
export function isWritable(v) {
  return !!v && typeof v === 'object' && typeof v.set === 'function';
}

/** Read a string prop, empty string for null/undefined. */
export function str(v) {
  const x = val(v);
  if (x === null || x === undefined) return '';
  if (typeof x === 'object') return JSON.stringify(x);
  return String(x);
}

/** Collect the direct child nodes in a prop value (node, array of nodes, or tabs). */
export function childNodes(v) {
  if (isNode(v)) return [v];
  if (Array.isArray(v)) return v.filter(isNode);
  return [];
}
