// Views: the bitwrench side of the adapter.
//
// One View per rendered component instance (keyed by the core's instanceId). A view
// mounts its component once with bitwrench, then updates it in place when the core's
// resolved props change. Child components live in named "slots" inside the parent's
// element; each child gets a holder element and its own View, kept in order with
// minimal DOM moves, so placeholders upgrade in place and focused inputs are never
// rebuilt by unrelated updates.
//
// The same component code also composes a static TACO tree (compose()), which is what
// HTML export and the playground's TACO inspector use.
import { isNode, val } from '../core/interface.js';

let uidCounter = 0;
const nextUid = () => `a2ui${(++uidCounter).toString(36)}`;

const SLOT_ATTR = 'data-a2ui-slot';

/**
 * Read the accessibility envelope from props (`@accessibility` in v1.0; the bare key is
 * still read for older cores). `read` unwraps resolved {value} bindings.
 */
export function a11yOf(p, read = val) {
  const a = p?.['@accessibility'] ?? p?.accessibility;
  if (!a || typeof a !== 'object') return null;
  return {
    label: read(a.label),
    description: read(a.description),
    live: read(a.live),
    hidden: read(a.hidden),
  };
}

function a11yAttrs(p, read) {
  const a = a11yOf(p, read);
  const out = {};
  if (!a) return out;
  if (a.label !== undefined && a.label !== null && a.label !== '') out['aria-label'] = String(a.label);
  if (a.description !== undefined && a.description !== null && a.description !== '') out['aria-description'] = String(a.description);
  if (a.live === 'polite' || a.live === 'assertive') out['aria-live'] = a.live;
  if (a.hidden === true || a.hidden === 'true') out['aria-hidden'] = 'true';
  return out;
}

// label/description name the focusable control; live/hidden describe the whole
// component, so they go on its root element.
const CONTROL_KEYS = ['aria-label', 'aria-description'];
const ROOT_KEYS = ['aria-live', 'aria-hidden'];

function setOrClear(el, keys, attrs) {
  for (const k of keys) {
    if (k in attrs) el.setAttribute(k, attrs[k]);
    else if (el.hasAttribute(k) && el.dataset.a2uiOwnA11y !== k) el.removeAttribute(k);
  }
}

function applyA11y(root, target, p, read) {
  const attrs = a11yAttrs(p, read);
  setOrClear(target, CONTROL_KEYS, attrs);
  setOrClear(root, ROOT_KEYS, attrs);
}

function weightOf(p) {
  const w = val(p?.weight);
  return typeof w === 'number' && Number.isFinite(w) && w >= 0 ? w : undefined;
}

/**
 * Shared environment for all views of one surface.
 * @typedef {object} ViewEnv
 * @property {object} bw            bitwrench
 * @property {object} surface       the core SurfaceModel
 * @property {(fn: Function) => Function} effect   core effect()
 * @property {(sig: object) => any} getValue        core getValue()
 * @property {(d: object) => void} diag            diagnostics sink
 * @property {Document} document
 */

export class View {
  /**
   * @param {object} node   core node
   * @param {HTMLElement} holder  element owned by the parent slot
   * @param {ViewEnv} env
   * @param {string} [parentType]
   */
  constructor(node, holder, env, parentType) {
    this.env = env;
    this.holder = holder;
    this.parentType = parentType;
    this.uid = nextUid();
    this.node = null;
    this.el = null;
    this.impl = null;
    this.type = null;
    this.p = null;
    this.state = {};
    this.slotEls = new Map();      // slot name -> element
    this.slotViews = new Map();    // slot name -> Map(instanceId -> View)
    this.slotOpts = new Map();     // slot name -> options
    this.stop = null;
    this.disposed = false;
    this.mounts = 0;
    this.setNode(node);
  }

  /** Switch to a (possibly new) node object for the same instanceId. */
  setNode(node) {
    if (node === this.node || this.disposed) return;
    this.node = node;
    if (this.stop) this.stop();
    this.stop = this.env.effect(() => this.#sync());
  }

  #sync() {
    const node = this.node;
    if (node.isPlaceholder || node.state !== 'resolved') {
      this.#unmountComponent();
      this.#setVisible(false);
      return;
    }
    const p = this.env.getValue(node.props);
    const impl = node.impl?.bw;
    if (!impl) {
      this.#unmountComponent();
      this.#setVisible(false);
      this.env.diag({ code: 'NO_IMPLEMENTATION', componentId: node.componentId, type: node.type,
        message: `No bitwrench implementation registered for component type "${node.type}".` });
      return;
    }
    if (!this.el || this.type !== node.type || this.impl !== impl) {
      this.#unmountComponent();
      this.p = p;
      this.#mountComponent(impl, node, p);
    } else {
      const prev = this.p;
      this.p = p;
      this.#updateComponent(p, prev);
    }
    this.#setVisible(true);
  }

  #setVisible(on) {
    const h = this.holder;
    const contents = h.dataset.a2uiItem === 'contents';
    h.style.display = on ? (contents ? 'contents' : '') : 'none';
    if (on) h.removeAttribute('aria-hidden'); else h.setAttribute('aria-hidden', 'true');
  }

  #ctx() {
    const view = this;
    const { bw, surface, getValue } = this.env;
    return {
      live: true,
      bw,
      uid: this.uid,
      surface,
      get state() { return view.state; },
      get p() { return view.p; },
      id: suffix => `${view.uid}-${suffix}`,
      on: fn => fn,
      slot(name, opts = {}) {
        view.slotOpts.set(name, opts);
        const { tag = 'div', attrs = {} } = opts;
        return { t: tag, a: { ...attrs, [SLOT_ATTR]: `${view.uid}:${name}` } };
      },
      /** Re-run the component's update with current props (after local state changes). */
      refresh() { view.#updateComponent(view.p, view.p); },
      /**
       * Reactive read of a value the core left raw ({"@path"}) or resolved without
       * tracking (a {value, path} binding inside an envelope of a custom component).
       */
      read(raw) {
        if (raw && typeof raw === 'object') {
          const path = typeof raw['@path'] === 'string' ? resolvePath(raw['@path'], view.node.dataPath)
            : typeof raw.path === 'string' && 'value' in raw ? raw.path : null;
          if (path) return getValue(surface.dataModel.getSignal(path));
        }
        return val(raw);
      },
    };
  }

  #mountComponent(impl, node, p) {
    const { bw } = this.env;
    this.impl = impl;
    this.type = node.type;
    this.ctx = this.#ctx();
    const taco = impl.render(p, this.ctx);
    this.el = bw.append(this.holder, taco);
    this.el.setAttribute('data-a2ui-id', node.componentId);
    this.el.setAttribute('data-a2ui-type', node.type);
    this.mounts++;
    this.#collectSlots();
    this.#syncSlots(p);
    this.#decorate(p);
  }

  #updateComponent(p, prev) {
    const impl = this.impl;
    let handled = false;
    if (impl.update) handled = impl.update(this.el, p, this.ctx, prev) !== false;
    if (!handled) this.#rerender(p);
    this.#syncSlots(p);
    this.#decorate(p);
  }

  #rerender(p) {
    const { bw } = this.env;
    // Detach child holders first so bitwrench's unmount of the old element does not
    // tear down child components' internals.
    for (const views of this.slotViews.values()) for (const v of views.values()) v.holder.remove();
    const taco = this.impl.render(p, this.ctx);
    this.el = bw.replace(this.el, taco);
    this.el.setAttribute('data-a2ui-id', this.node.componentId);
    this.el.setAttribute('data-a2ui-type', this.node.type);
    this.#collectSlots();
  }

  #collectSlots() {
    this.slotEls.clear();
    const prefix = `${this.uid}:`;
    const found = [this.el, ...this.el.querySelectorAll(`[${SLOT_ATTR}]`)];
    for (const el of found) {
      const s = el.getAttribute?.(SLOT_ATTR);
      if (s && s.startsWith(prefix)) this.slotEls.set(s.slice(prefix.length), el);
    }
  }

  #syncSlots(p) {
    const wanted = this.impl.slots ? this.impl.slots(p, this.ctx) : defaultSlots(p);
    for (const [name, nodes] of Object.entries(wanted)) {
      this.#syncSlot(name, [].concat(nodes).filter(isNode));
    }
    // Slots no longer requested (for example the closed Modal content) are emptied.
    for (const name of [...this.slotViews.keys()]) {
      if (!(name in wanted)) this.#syncSlot(name, []);
    }
  }

  #syncSlot(name, nodes) {
    const slotEl = this.slotEls.get(name);
    let views = this.slotViews.get(name);
    if (!views) { views = new Map(); this.slotViews.set(name, views); }
    const keep = new Set(nodes.map(n => n.instanceId));
    for (const [id, v] of views) if (!keep.has(id)) { v.dispose(); views.delete(id); }
    if (!slotEl) return;              // the component named a slot it did not render
    const opts = this.slotOpts.get(name);
    let i = 0;
    for (const n of nodes) {
      let v = views.get(n.instanceId);
      if (v) {
        v.setNode(n);
      } else {
        const holder = makeHolder(this.env.document, opts.item ?? 'contents', opts.itemAttrs);
        slotEl.appendChild(holder);
        v = new View(n, holder, this.env, this.node.type);
        views.set(n.instanceId, v);
      }
      const at = slotEl.children[i];
      if (at !== v.holder) slotEl.insertBefore(v.holder, at);
      i++;
    }
  }

  #decorate(p) {
    const target = this.impl.a11yTarget ? (this.impl.a11yTarget(this.el) ?? this.el) : this.el;
    applyA11y(this.el, target, p, this.ctx.read);
    const w = weightOf(p);
    if (this.holder.dataset.a2uiItem !== 'contents') {
      this.holder.style.flex = w !== undefined ? `${w} 1 0%` : '';
    }
  }

  #unmountComponent() {
    for (const views of this.slotViews.values()) for (const v of views.values()) v.dispose();
    this.slotViews.clear();
    this.slotEls.clear();
    if (this.el) {
      this.impl.unmount?.(this.el, this.ctx);
      this.env.bw.remove(this.el);
    }
    this.el = null;
    this.impl = null;
    this.type = null;
    this.p = null;
    this.state = {};
  }

  /** Find this view or a descendant by wire component id (first match, depth first). */
  find(componentId) {
    if (this.node?.componentId === componentId) return this;
    for (const c of this.children()) {
      const hit = c.find(componentId);
      if (hit) return hit;
    }
    return null;
  }

  /** Children currently mounted, in slot order, each slot in DOM order. */
  children() {
    const out = [];
    for (const [name, views] of this.slotViews) {
      const byHolder = new Map([...views.values()].map(v => [v.holder, v]));
      for (const h of this.slotEls.get(name)?.children ?? []) if (byHolder.has(h)) out.push(byHolder.get(h));
    }
    return out;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.#unmountComponent();
    this.holder.remove();
  }
}

function makeHolder(doc, kind, attrs = {}) {
  const h = doc.createElement('div');
  h.dataset.a2uiItem = kind;
  h.className = kind === 'contents' ? 'a2ui-holder' : 'a2ui-item';
  if (kind === 'contents') h.style.display = 'contents';
  for (const [k, v] of Object.entries(attrs)) h.setAttribute(k, v);
  return h;
}

/** Default slots: `children` (list) and `child` (single). */
export function defaultSlots(p) {
  const out = {};
  if (Array.isArray(p?.children)) out.children = p.children.filter(isNode);
  if (isNode(p?.child)) out.child = [p.child];
  return out;
}

/** Resolve a JSON Pointer against a node's data scope (relative paths have no leading /). */
export function resolvePath(path, base = '/') {
  if (path.startsWith('/')) return path;
  return `${base.replace(/\/+$/, '')}/${path}`;
}

// ---------------------------------------------------------------------------------
// Static composition: the same components, rendered to one TACO tree with no handlers.
// ---------------------------------------------------------------------------------

/**
 * Compose a node and its descendants into a single TACO tree.
 * @param {object} node
 * @param {{getValue: Function, surface: object, bw?: object}} env
 */
export function compose(node, env, depth = 0) {
  if (!node || node.state !== 'resolved' || node.isPlaceholder || depth > 64) return null;
  const impl = node.impl?.bw;
  if (!impl) return null;
  const p = env.getValue(node.props);
  const uid = nextUid();
  const state = {};
  const ctx = {
    live: false,
    bw: env.bw,
    uid,
    surface: env.surface,
    state,
    p,
    id: suffix => `${uid}-${suffix}`,
    on: () => undefined,
    slot(name, opts = {}) {
      const { tag = 'div', attrs = {}, item = 'contents', itemAttrs = {} } = opts;
      const wanted = impl.slots ? impl.slots(p, ctx) : defaultSlots(p);
      const nodes = [].concat(wanted[name] ?? []).filter(isNode);
      const c = [];
      for (const n of nodes) {
        const child = compose(n, env, depth + 1);
        if (!child) continue;
        if (item === 'contents') c.push(child);
        else {
          const w = weightOf(env.getValue(n.props));
          const a = { class: 'a2ui-item', ...itemAttrs };
          if (w !== undefined) a.style = `flex:${w} 1 0%`;
          c.push({ t: 'div', a, c: child });
        }
      }
      return { t: tag, a: attrs, c };
    },
    read(raw) {
      if (raw && typeof raw === 'object' && typeof raw['@path'] === 'string') {
        return env.surface.dataModel.get(resolvePath(raw['@path'], node.dataPath));
      }
      return val(raw);
    },
  };
  const taco = impl.render(p, ctx);
  taco.a = { ...(taco.a ?? {}), 'data-a2ui-id': node.componentId, 'data-a2ui-type': node.type, ...a11yAttrs(p, ctx.read) };
  return taco;
}

/** Strip function-valued attributes (handlers) from a TACO tree, in place. */
export function stripHandlers(taco) {
  if (!taco || typeof taco !== 'object') return taco;
  if (Array.isArray(taco)) { taco.forEach(stripHandlers); return taco; }
  if (taco.a) for (const k of Object.keys(taco.a)) if (typeof taco.a[k] === 'function' || taco.a[k] === undefined) delete taco.a[k];
  if (taco.o) delete taco.o;
  if (taco.c) stripHandlers(taco.c);
  return taco;
}
