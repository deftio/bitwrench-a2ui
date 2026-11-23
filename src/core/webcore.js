// The only module in bitwrench-a2ui that imports @a2ui/web_core.
//
// Everything the adapter needs from the core goes through here, so a different core
// (the planned standalone build) can replace this file without touching the adapter.
// We import only from the public `@a2ui/web_core/v1_0` facade, and only the names the
// A2UI framework adapter blueprint allows adapters to use.
import {
  A2uiExpressionError,
  BASIC_FUNCTIONS,
  Catalog,
  MessageProcessor,
  NodeResolver,
  effect,
  getValue,
} from '@a2ui/web_core/v1_0';

import basicCatalogJson from '../catalog/basic/catalog-json.js';

export { NodeResolver, effect, getValue };

export const BASIC_CATALOG_ID = basicCatalogJson.catalogId;
export const PROTOCOL_VERSION = '1.0';

/**
 * Build a web_core Catalog from a catalog document plus our implementations.
 *
 * Component schemas come from the JSON document via Catalog.fromJson. We never import
 * web_core's TextApi/ButtonApi/... objects: they are re-exported through a barrel that
 * constructs Lit elements at load time, which would pull Lit into every bundle.
 *
 * @param {object} json             A2UI catalog document (must declare catalogId).
 * @param {Record<string, object>} implementations  name -> component implementation.
 * @param {Array<object>} [functions]  web_core FunctionImplementation objects.
 */
export function buildCatalog(json, implementations = {}, functions = []) {
  const schemaOnly = Catalog.fromJson(json, PROTOCOL_VERSION);
  const components = [...schemaOnly.components.values()].map(api => ({
    ...api,
    bw: implementations[api.name],
  }));
  const fns = [...functions];
  const proxies = [];
  // Functions the document declares without an implementation are routed to the agent
  // (spec: fallback routing). web_core 0.15 has no agent-function implementation of its
  // own, so we give each one an execute() that forwards through the processor's public
  // callAgentFunction(). agentOnly functions are left schema-only: they may not be bound
  // in the UI, and the core reports that.
  for (const f of schemaOnly.functions.values()) {
    if (fns.some(x => x.name === f.name)) continue;
    if (f.allowedCallers === 'agentOnly') { fns.push(f); continue; }
    const proxy = {
      ...f,
      execute(args, ctx) {
        const call = proxy.callAgent;
        const surfaceId = ctx?.surface?.id;
        if (!call || !surfaceId) throw new Error(`Agent function "${f.name}" called with no agent connection`);
        // Reactive evaluations (bindings, checks) share an identical in-flight call, as
        // the spec allows; actions (user activated) always send a fresh call.
        const reactive = !ctx.isUserActivated;
        const key = reactive ? `${surfaceId}\u0000${f.name}\u0000${stableJson(args)}` : null;
        if (key && proxy.inflight.has(key)) return proxy.inflight.get(key);
        // We choose the call id so a failure can be reported against it.
        const functionCallId = newCallId();
        const p = Promise.resolve(call(surfaceId, { '@call': f.name, catalogId: json.catalogId, args }, { functionCallId }))
          .catch(e => {
            throw new A2uiExpressionError(`[${e?.code ?? 'EXECUTION_ERROR'}] ${e?.message ?? e}`, f.name, { functionCallId, code: e?.code });
          })
          .finally(() => { if (key) proxy.inflight.delete(key); });
        if (key) proxy.inflight.set(key, p);
        return p;
      },
      inflight: new Map(),
    };
    proxies.push(proxy);
    fns.push(proxy);
  }
  const catalog = new Catalog(json.catalogId, PROTOCOL_VERSION, components, fns);
  AGENT_PROXIES.set(catalog, proxies);
  return catalog;
}

const AGENT_PROXIES = new WeakMap();

/** JSON with sorted object keys, for comparing argument objects. */
function stableJson(v) {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(',')}}`;
  return JSON.stringify(v) ?? 'null';
}

let callCounter = 0;
function newCallId() {
  const rnd = globalThis.crypto?.randomUUID?.();
  return rnd ? `bw-${rnd}` : `bw-${Date.now().toString(36)}-${(++callCounter).toString(36)}`;
}

/** The basic catalog with the given component implementations and the core's functions. */
export function buildBasicCatalog(implementations, extraFunctions = []) {
  return buildCatalog(basicCatalogJson, implementations, [...BASIC_FUNCTIONS, ...extraFunctions]);
}

/**
 * Make a function implementation for a catalog from a plain JavaScript function.
 *
 * The argument schema is JSON Schema (as in a catalog document); the core derives its
 * own validator from it, so hosts never need to import a schema library.
 *
 * @param {object} def
 * @param {string} def.name
 * @param {(args: object, ctx: object) => any} def.execute   ctx.dataModel is available
 * @param {object} [def.args]   JSON Schema for the args object (default: any object)
 * @param {string} [def.returnType='any']
 * @param {'rendererOnly'|'rendererOrAgent'} [def.allowedCallers]
 * @param {boolean} [def.requiresUserActivation]
 * @param {string} [def.description]
 */
export function makeFunction({ name, execute, args, returnType = 'any', allowedCallers, requiresUserActivation, description }) {
  if (typeof name !== 'string' || !name) throw new TypeError('makeFunction: name is required');
  if (typeof execute !== 'function') throw new TypeError(`makeFunction(${name}): execute must be a function`);
  const definition = {
    type: 'object',
    properties: { '@call': { const: name }, args: args ?? { type: 'object', additionalProperties: true } },
    required: ['@call'],
    returnType,
    ...(description ? { description } : {}),
    ...(allowedCallers ? { allowedCallers } : {}),
    ...(requiresUserActivation ? { requiresUserActivation: true } : {}),
  };
  const doc = { catalogId: 'urn:bitwrench-a2ui:functions', protocolVersion: PROTOCOL_VERSION, components: {}, functions: { [name]: definition } };
  const api = Catalog.fromJson(doc, PROTOCOL_VERSION).functions.get(name);
  return { ...api, execute };
}

// ---------------------------------------------------------------------------------
// Envelope key normalizer
//
// The A2UI v1.0 spec writes the component envelope mixins with an `@` sigil:
// `@checks`, `@accessibility`, `@metadata`, `@catalogId`. @a2ui/web_core 0.15.0 (the
// latest release on npm) still accepts only the pre-1.0 bare spellings (`checks`,
// `accessibility`, ...), and rejects the `@` forms as unrecognized keys. The upstream
// repository fixes this in 0.16.0, which is not yet published.
//
// Until then we rewrite the envelope keys of each component to the bare form before
// handing messages to the core. A component that sends both spellings of one key is left
// alone so the core reports it, as the spec requires.
// TODO(web_core>=0.16): delete this normalizer and its tests.
// ---------------------------------------------------------------------------------
const ENVELOPE_KEYS = ['@checks', '@accessibility', '@metadata', '@catalogId'];

function normalizeComponent(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return c;
  let out = c;
  for (const key of ENVELOPE_KEYS) {
    if (!(key in c)) continue;
    const bare = key.slice(1);
    if (bare in c) continue;
    if (out === c) out = { ...c };
    out[bare] = out[key];
    delete out[key];
  }
  return out;
}

function normalizeComponents(list) {
  return Array.isArray(list) ? list.map(normalizeComponent) : list;
}

/**
 * Rewrite v1.0 `@`-prefixed component envelope keys to the form web_core 0.15 accepts.
 *
 * With `dropTheme`, also remove a `theme` from v1.0 createSurface messages: v1.0 removed
 * theming from the wire, and the spec has relaxed renderers drop it, but web_core 0.15
 * rejects the whole message. `onDrop` is called for each theme removed.
 */
export function normalizeMessage(msg, opts = {}) {
  if (!msg || typeof msg !== 'object') return msg;
  if (Array.isArray(msg)) return msg.map(m => normalizeMessage(m, opts));
  if (Array.isArray(msg.messages)) return { ...msg, messages: msg.messages.map(m => normalizeMessage(m, opts)) };
  if (msg.createSurface && typeof msg.createSurface === 'object') {
    const cs = { ...msg.createSurface };
    if (opts.dropTheme && 'theme' in cs) {
      delete cs.theme;
      opts.onDrop?.(cs.surfaceId);
    }
    if (cs.components) cs.components = normalizeComponents(cs.components);
    return { ...msg, createSurface: cs };
  }
  if (msg.updateComponents?.components) {
    return { ...msg, updateComponents: { ...msg.updateComponents, components: normalizeComponents(msg.updateComponents.components) } };
  }
  return msg;
}

// ---------------------------------------------------------------------------------
// Message size limits.
//
// web_core 0.15 validates with zod 3, which keeps every issue of every failing array
// element (GHSA-mrhx-c7xc-m3w5, fixed only in zod 4, which web_core 0.15 cannot use).
// A 250 KB message of 20,000 invalid components costs about 116 MB of heap, and 100,000
// overflow the stack. Agent output is untrusted, so each message is measured before the
// core sees it, and one over the limits is rejected as VALIDATION_FAILED.
// TODO(web_core on zod 4): keep the limits as defense in depth, revisit the defaults.
// ---------------------------------------------------------------------------------
export const DEFAULT_LIMITS = Object.freeze({ maxArrayItems: 10000, maxDepth: 64 });

/**
 * Check one message against the limits. Returns null when it fits, else
 * `{ path, message }` naming the first place it does not. The walk is iterative, so a
 * deeply nested message cannot overflow the stack here either.
 */
export function checkLimits(msg, limits = DEFAULT_LIMITS) {
  const { maxArrayItems, maxDepth } = { ...DEFAULT_LIMITS, ...limits };
  let items = 0;
  const stack = [[msg, '', 0]];
  while (stack.length) {
    const [value, path, depth] = stack.pop();
    if (!value || typeof value !== 'object') continue;
    if (depth > maxDepth) return { path, message: `message is nested more than ${maxDepth} levels deep` };
    const isArray = Array.isArray(value);
    if (isArray && (items += value.length) > maxArrayItems) {
      return { path, message: `message has more than ${maxArrayItems} array items in total` };
    }
    const keys = isArray ? value.keys() : Object.keys(value);
    for (const k of keys) stack.push([value[k], `${path}/${k}`, depth + 1]);
  }
  return null;
}

// The envelopes of a receive() call: one message, an array, or {messages: [...]}.
const envelopes = input => Array.isArray(input) ? input
  : Array.isArray(input?.messages) ? input.messages : [input];

// Only called for a message checkLimits rejected, which is always an object or array.
function surfaceIdOf(msg) {
  for (const v of Object.values(msg)) {
    if (typeof v?.surfaceId === 'string') return v.surfaceId;
  }
  return undefined;
}

/** Validation presets. 'relaxed' tolerates streams that are incomplete for a while. */
export const VALIDATION = {
  strict: { allowOrphanComponents: false, allowDanglingReferences: false, allowMissingRoot: false, allowUnknownElements: false },
  relaxed: { allowOrphanComponents: true, allowDanglingReferences: true, allowMissingRoot: true, allowUnknownElements: true },
};

/**
 * Create the core processor.
 *
 * @param {object} opts
 * @param {Array} opts.catalogs           Catalogs from buildCatalog / buildBasicCatalog.
 * @param {'strict'|'relaxed'|object} [opts.validation]
 * @param {(msg: object) => void} opts.onOutbound  Receives RPC envelopes (callAgentFunction, rendererFunctionResponse).
 */
export function createCore({ catalogs, validation, limits, onOutbound, onNote = () => {} }) {
  const validationConfig = typeof validation === 'string' ? VALIDATION[validation] : validation;
  const processor = new MessageProcessor(catalogs, undefined, {
    ...(validationConfig ? { validationConfig } : {}),
    outboundListener: msg => onOutbound(msg),
  });
  for (const c of catalogs) {
    for (const proxy of AGENT_PROXIES.get(c) ?? []) {
      proxy.callAgent = (surfaceId, call, options) => processor.callAgentFunction(surfaceId, call, options);
    }
  }
  const dropTheme = validation !== 'strict';
  const onDrop = surfaceId => onNote({ level: 'warning', code: 'THEME_DROPPED', surfaceId,
    message: 'createSurface.theme is not part of A2UI v1.0; it was ignored. Style surfaces with the renderer theme option.' });
  return {
    processor,
    /** Process messages synchronously. Returns renderer error envelopes. */
    process(messages) {
      const list = envelopes(messages);
      const rejected = [];
      const accepted = list.filter(m => {
        const over = checkLimits(m, limits);
        if (!over) return true;
        const surfaceId = surfaceIdOf(m);
        rejected.push({ version: PROTOCOL_VERSION, error: {
          code: 'VALIDATION_FAILED', ...(surfaceId === undefined ? {} : { surfaceId }), path: over.path || '/',
          message: `Message rejected before validation: ${over.message}.`,
        } });
        return false;
      });
      // Pass the input through untouched when nothing was rejected.
      const input = rejected.length ? accepted : messages;
      const errors = accepted.length ? processor.processMessagesWithErrors(normalizeMessage(input, { dropTheme, onDrop })) : [];
      return [...rejected, ...errors];
    },
    capabilities(options = {}) {
      return processor.getRendererCapabilities({ version: PROTOCOL_VERSION, ...options });
    },
    dataModelMetadata() {
      return processor.getRendererDataModel(PROTOCOL_VERSION);
    },
    surfaces() { return processor.getSurfaces(); },
    surface(id) { return processor.getSurface(id); },
    onSurfaceCreated(fn) { return processor.onSurfaceCreated(fn); },
    onSurfaceDeleted(fn) { return processor.onSurfaceDeleted(fn); },
    dispose() { processor.dispose(); },
  };
}
