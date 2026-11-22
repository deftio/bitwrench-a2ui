// createRenderer: the public entry point.
//
//   const r = createRenderer({ mount: '#app', send: (msg, meta) => ... });
//   r.receive(message | message[] | {messages})
//
// Messages go to the core (web_core). The renderer mounts one host element per surface,
// renders the core's node tree with bitwrench views, and forwards everything the core
// emits (actions, errors, RPC) to `send` as v1.0 renderer-to-agent envelopes.
import bwDefault from 'bitwrench';
import { VERSION } from './version.js';

import { BASIC_CATALOG_ID, NodeResolver, PROTOCOL_VERSION, buildBasicCatalog, createCore, effect, getValue } from './core/webcore.js';
import { BASIC_COMPONENTS } from './catalog/basic/components.js';
import { applyTheme, removeTheme } from './theme/theme.js';
import { View, compose, stripHandlers } from './render/view.js';
import { val } from './core/interface.js';

let surfaceCounter = 0;

/** The default basic catalog: upstream schemas, bitwrench implementations, core functions. */
export function createBasicCatalog({ components = {}, functions = [] } = {}) {
  return buildBasicCatalog({ ...BASIC_COMPONENTS, ...components }, functions);
}

/**
 * Frame a surface error as a v1.0 renderer-to-agent error envelope. Generic errors
 * carry exactly one of functionCallId or surfaceId, as the schema requires.
 */
export function frameError(err, surfaceId) {
  const error = { code: String(err.code), message: String(err.message) };
  const callId = err.functionCallId ?? err.details?.functionCallId;
  if (typeof callId === 'string') error.functionCallId = callId;
  else error.surfaceId = surfaceId;
  if (typeof err.path === 'string') error.path = err.path;
  return { version: PROTOCOL_VERSION, error };
}

/** Frame a core action payload as a v1.0 `action` envelope. */
export function frameAction(a) {
  const action = {
    name: a.name, surfaceId: a.surfaceId, sourceComponentId: a.sourceComponentId,
    timestamp: a.timestamp, context: a.context,
  };
  if (a.userMessage !== undefined) action.userMessage = a.userMessage;
  if (a.metadata !== undefined) action.metadata = a.metadata;
  return { version: PROTOCOL_VERSION, action };
}

/**
 * Create a renderer.
 *
 * @param {object} opts
 * @param {Element|string} [opts.mount]   container element or selector (omit for headless use)
 * @param {(message: object, metadata: object) => void} [opts.send]  outbound envelopes
 * @param {(d: object) => void} [opts.onDiagnostic]   local diagnostics (errors, warnings, notes)
 * @param {Array} [opts.catalogs]          catalogs (default: [createBasicCatalog()])
 * @param {'strict'|'relaxed'|object} [opts.validation]  core validation (default: core default)
 * @param {string|object} [opts.theme]     bitwrench preset name or StyleConfig
 * @param {object} [opts.bw]               bitwrench instance (default: the imported one)
 * @param {boolean} [opts.includeCapabilities=true]  attach a2uiRendererCapabilities to metadata
 */
export function createRenderer(opts = {}) {
  const bw = opts.bw ?? bwDefault;
  const doc = opts.document ?? globalThis.document;
  const send = typeof opts.send === 'function' ? opts.send : () => {};
  const diagnostics = typeof opts.onDiagnostic === 'function' ? opts.onDiagnostic : () => {};
  const catalogs = opts.catalogs ?? [createBasicCatalog()];
  let theme = opts.theme;
  let themeMode = 'light';

  const mountEl = typeof opts.mount === 'string' ? doc?.querySelector(opts.mount) : opts.mount ?? null;
  if (typeof opts.mount === 'string' && !mountEl) throw new Error(`createRenderer: mount target "${opts.mount}" not found`);

  const outbound = [];          // last N messages, for inspectors
  const OUTBOUND_KEEP = 200;

  function metadata() {
    const meta = {};
    if (opts.includeCapabilities !== false) meta.a2uiRendererCapabilities = core.capabilities();
    const dm = core.dataModelMetadata();
    if (dm) meta.a2uiRendererDataModel = dm;
    return meta;
  }

  function emit(message) {
    outbound.push(message);
    if (outbound.length > OUTBOUND_KEEP) outbound.shift();
    try { send(message, metadata()); } catch (e) { diagnostics({ level: 'error', code: 'SEND_FAILED', message: String(e?.message ?? e) }); }
  }

  const core = createCore({ catalogs, validation: opts.validation, onOutbound: msg => emit(msg), onNote: d => diagnostics({ source: 'process', ...d }) });

  /** @type {Map<string, {surface: object, host: HTMLElement|null, resolver: object, root: View|null, stop: Function, subs: Array}>} */
  const mounted = new Map();

  function mountSurface(surface) {
    const subs = [];
    subs.push(surface.onAction.subscribe(a => emit(frameAction(a))));
    subs.push(surface.onError.subscribe(err => {
      diagnostics({ level: 'error', source: 'surface', surfaceId: surface.id, ...err });
      recentSurfaceErrors.add(`${err.code}|${err.message}`);
      emit(frameError(err, surface.id));
    }));
    subs.push(surface.onWarning.subscribe(w => diagnostics({ level: 'warning', source: 'surface', surfaceId: surface.id, ...w })));
    const resolver = new NodeResolver(surface);
    const entry = { surface, host: null, resolver, root: null, stop: null, subs };
    if (mountEl) {
      const host = doc.createElement('div');
      host.className = 'a2ui-surface';
      host.id = `a2ui-s-${++surfaceCounter}`;
      host.dataset.surfaceId = surface.id;
      mountEl.appendChild(host);
      applyTheme(bw, host, theme);
      if (themeMode === 'dark') host.classList.add('bw_theme_alt');
      entry.host = host;
      const env = { bw, surface, effect, getValue, document: doc, diag: d => diagnostics({ level: 'warning', source: 'render', surfaceId: surface.id, ...d }) };
      entry.stop = effect(() => {
        const root = getValue(resolver.rootNode);
        if (!root) return;
        if (entry.root) entry.root.setNode(root);
        else {
          const holder = doc.createElement('div');
          holder.className = 'a2ui-holder';
          holder.dataset.a2uiItem = 'contents';
          holder.style.display = 'contents';
          host.appendChild(holder);
          entry.root = new View(root, holder, env, 'Surface');
        }
      });
    }
    mounted.set(surface.id, entry);
  }

  function unmountSurface(id) {
    const entry = mounted.get(id);
    if (!entry) return;
    mounted.delete(id);
    entry.stop?.();
    entry.root?.dispose();
    entry.resolver.dispose();
    for (const s of entry.subs) s.unsubscribe?.();
    if (entry.host) {
      removeTheme(bw, entry.host);
      entry.host.remove();
    }
  }

  const subCreated = core.onSurfaceCreated(mountSurface);
  const subDeleted = core.onSurfaceDeleted(unmountSurface);

  // The core can report one problem twice: on the surface's error channel while it
  // resolves, and again in the processing result. Each is sent to the agent once.
  const recentSurfaceErrors = new Set();

  function report(errors) {
    for (const e of errors) {
      diagnostics({ level: 'error', source: 'process', ...e.error });
      if (recentSurfaceErrors.has(`${e.error?.code}|${e.error?.message}`)) continue;
      emit(e);
    }
    recentSurfaceErrors.clear();
    return errors;
  }

  const api = {
    /** Process one envelope, an array, or {messages:[...]}. Returns the error envelopes from processing. */
    receive(messages) {
      recentSurfaceErrors.clear();
      return report(core.process(messages));
    },

    /** Process a JSONL text chunk stream (string or async iterable of strings/bytes). */
    async receiveStream(stream, { onMessage } = {}) {
      const { readJsonl } = await import('./transport/jsonl.js');
      for await (const item of readJsonl(stream)) {
        if (item.error) { diagnostics({ level: 'error', code: 'JSONL_PARSE', ...item.error }); continue; }
        onMessage?.(item.message);
        api.receive(item.message);
      }
    },

    /** a2uiRendererCapabilities for the transport's metadata. */
    capabilities: options => core.capabilities(options),

    /** Metadata to attach to the next outbound transport message. */
    metadata,

    /** Surface ids currently known to the core. */
    surfaceIds: () => [...core.surfaces().keys()],

    /** Inspection snapshot: data model, component definitions, view tree, composed TACO. */
    inspect(surfaceId) {
      const surface = core.surface(surfaceId ?? api.surfaceIds()[0]);
      if (!surface) return null;
      const entry = mounted.get(surface.id);
      const root = getValue(entry?.resolver.rootNode);
      return {
        surfaceId: surface.id,
        catalogId: surface.defaultCatalog?.id,
        dataModel: structuredClone(surface.dataModel.get('/')),
        viewTree: entry?.root ? viewTree(entry.root) : null,
        taco: root ? stripHandlers(compose(root, { bw, surface, getValue })) : null,
      };
    },

    /** The live view tree of a surface (ids, types, states and key resolved props). */
    viewTree(surfaceId) {
      const entry = mounted.get(surfaceId ?? api.surfaceIds()[0]);
      return entry?.root ? viewTree(entry.root) : null;
    },

    /** The DOM host element of a surface. */
    host: surfaceId => mounted.get(surfaceId ?? api.surfaceIds()[0])?.host ?? null,

    /** The core SurfaceModel (advanced use). */
    surface: surfaceId => core.surface(surfaceId ?? api.surfaceIds()[0]),

    /** Recent outbound envelopes (most recent last). */
    outbound: () => outbound.slice(),

    /** Change the theme of all mounted surfaces (and future ones). */
    setTheme(next) {
      theme = next;
      for (const e of mounted.values()) if (e.host) applyTheme(bw, e.host, theme);
    },

    /** 'light' | 'dark' | 'auto' */
    setThemeMode(mode) {
      const dark = mode === 'dark' || (mode === 'auto' && !!globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.matches);
      themeMode = dark ? 'dark' : 'light';
      for (const e of mounted.values()) e.host?.classList.toggle('bw_theme_alt', dark);
      return themeMode;
    },

    /** Remove all surfaces (core state and DOM). */
    reset() {
      for (const id of api.surfaceIds()) api.receive({ version: PROTOCOL_VERSION, deleteSurface: { surfaceId: id } });
    },

    /** Tear everything down. */
    destroy() {
      for (const id of [...mounted.keys()]) unmountSurface(id);
      subCreated.unsubscribe?.();
      subDeleted.unsubscribe?.();
      core.dispose();
    },

    /** The underlying core processor (web_core MessageProcessor). */
    get processor() { return core.processor; },

    /** Inspection hooks for tests, the playground and devtools. Not a stable API. */
    debug: {
      rootView: surfaceId => mounted.get(surfaceId ?? api.surfaceIds()[0])?.root ?? null,
      findView: (componentId, surfaceId) => mounted.get(surfaceId ?? api.surfaceIds()[0])?.root?.find(componentId) ?? null,
      /** Unmount a surface's view (DOM and resolver) without deleting it from the core. */
      unmount: surfaceId => unmountSurface(surfaceId ?? api.surfaceIds()[0]),
    },
    catalogId: BASIC_CATALOG_ID,
    /** The A2UI protocol version this renderer speaks ('1.0'). */
    protocolVersion: PROTOCOL_VERSION,
    /** The bitwrench-a2ui package version. */
    version: VERSION,
  };
  return api;
}

/** Build a plain-object view tree from live views. */
export function viewTree(view) {
  const node = view.node;
  const p = view.p ?? {};
  const out = { id: node.componentId, type: node.type, state: node.state };
  if (node.state !== 'resolved') out.occupiesLayout = false;
  for (const key of ['text', 'value', 'url', 'name', 'axis', 'label']) {
    if (key in p) {
      const v = val(p[key]);
      if (v !== undefined && (typeof v !== 'object' || Array.isArray(v))) out[key] = v;
    }
  }
  if ('isValid' in p) out.isValid = p.isValid;
  const kids = view.children();
  if (kids.length) out.children = kids.map(viewTree);
  return out;
}
