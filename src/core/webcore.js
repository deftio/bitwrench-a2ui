// The only module in bitwrench-a2ui that imports @a2ui/web_core.
//
// Everything the adapter needs from the core goes through here, so a different core
// (the planned standalone build) can replace this file without touching the adapter.
// We import only from the public `@a2ui/web_core/v1_0` facade, and only the names the
// A2UI framework adapter blueprint allows adapters to use.
import {
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
  // Functions the document declares without an implementation stay schema-only: web_core
  // (0.16+) routes a call to one to the agent with callAgentFunction, the spec's fallback
  // routing, sharing identical in-flight calls from bindings and checks.
  const fns = [...functions];
  for (const f of schemaOnly.functions.values()) {
    if (!fns.some(x => x.name === f.name)) fns.push(f);
  }
  return new Catalog(json.catalogId, PROTOCOL_VERSION, components, fns);
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
// Theme normalizer
//
// A2UI v1.0 removed `theme` from createSurface; the spec has strict renderers reject it
// and relaxed renderers drop it. @a2ui/web_core (0.16.1) still rejects the whole message
// in every mode, so outside strict mode we drop the key first. (web_core 0.16 reads the
// v1.0 `@checks`, `@accessibility`, `@metadata` and `@catalogId` keys itself, so the
// envelope-key rewrite 0.15 needed is gone.)
// TODO(web_core): delete when relaxed validation drops createSurface.theme itself.
// ---------------------------------------------------------------------------------

/**
 * Prepare messages for the core. With `dropTheme`, remove `theme` from createSurface
 * messages (v1.0 removed it; relaxed renderers drop it) and call `onDrop(surfaceId)` for
 * each. Anything else is returned unchanged. Accepts one message, an array, or
 * `{messages: [...]}`.
 */
export function normalizeMessage(msg, opts = {}) {
  if (!msg || typeof msg !== 'object') return msg;
  if (Array.isArray(msg)) return msg.map(m => normalizeMessage(m, opts));
  if (Array.isArray(msg.messages)) return { ...msg, messages: msg.messages.map(m => normalizeMessage(m, opts)) };
  if (opts.dropTheme && msg.createSurface && typeof msg.createSurface === 'object' && 'theme' in msg.createSurface) {
    const { theme, ...cs } = msg.createSurface;
    opts.onDrop?.(cs.surfaceId);
    return { ...msg, createSurface: cs };
  }
  return msg;
}

// ---------------------------------------------------------------------------------
// Message size limits.
//
// web_core (0.16.1, like 0.15) validates with zod 3, which keeps every issue of every
// failing array element (GHSA-mrhx-c7xc-m3w5, fixed only in zod 4, which web_core does
// not use yet).
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

/**
 * A deep copy of a message or data-model value. structuredClone where the platform has it
 * (browsers, Node); jsdom windows do not, so fall back to a JSON round trip, which loses
 * nothing for A2UI messages (they are JSON). Primitives are returned as they are.
 */
export function detach(value) {
  if (!value || typeof value !== 'object') return value;
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
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
 * @param {(msg: object) => void} [opts.onOutbound]  Receives RPC envelopes (callAgentFunction, rendererFunctionResponse). Omit it when there is no agent (static rendering).
 */
export function createCore({ catalogs, validation, limits, onOutbound, onNote = () => {} }) {
  const validationConfig = typeof validation === 'string' ? VALIDATION[validation] : validation;
  const processor = new MessageProcessor(catalogs, undefined, {
    ...(validationConfig ? { validationConfig } : {}),
    // Without onOutbound (static rendering), web_core has no agent to call: a function that
    // needs the agent fails locally and is reported, instead of being sent nowhere.
    ...(onOutbound ? { outboundListener: msg => onOutbound(msg) } : {}),
  });
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
      // web_core keeps the data-model objects of createSurface and updateDataModel and
      // writes user edits into them. Give it copies, so the caller's messages (a log, a
      // fixture, a replay buffer) stay exactly as received. Copied after checkLimits, so an
      // oversized message is never cloned.
      const detached = accepted.map(detach);
      const errors = detached.length ? processor.processMessagesWithErrors(normalizeMessage(detached, { dropTheme, onDrop })) : [];
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
