// Small helpers for building A2UI v1.0 messages in tests.
import { freshMount } from './dom.js';

const { createRenderer, BASIC_CATALOG_ID } = await import('../../src/index.js');

export { BASIC_CATALOG_ID };

export const create = (surfaceId, components, dataModel, extra = {}) => ({
  version: '1.0',
  createSurface: { surfaceId, catalogId: BASIC_CATALOG_ID, components, ...(dataModel ? { dataModel } : {}), ...extra },
});
export const update = (surfaceId, components) => ({ version: '1.0', updateComponents: { surfaceId, components } });
export const data = (surfaceId, path, value) => ({ version: '1.0', updateDataModel: { surfaceId, ...(path === undefined ? {} : { path }), value } });
export const del = surfaceId => ({ version: '1.0', deleteSurface: { surfaceId } });

/** Render one surface and return helpers. */
export function render(components, dataModel, opts = {}) {
  const mount = freshMount();
  const sent = [];
  const diags = [];
  const r = createRenderer({ mount, send: (m, meta) => sent.push({ m, meta }), onDiagnostic: d => diags.push(d), ...opts });
  r.receive(create('s', components, dataModel, opts.surface));
  const el = id => r.debug.findView(id)?.el ?? null;
  const view = id => r.debug.findView(id);
  const model = path => r.surface('s').dataModel.get(path ?? '/');
  const setData = (path, value) => r.receive(data('s', path, value));
  const setComponents = comps => r.receive(update('s', comps));
  return { r, mount, sent, diags, el, view, model, setData, setComponents };
}

export const fire = (el, type, init = {}) => el.dispatchEvent(new globalThis.window.Event(type, { bubbles: true, ...init }));
export const key = (el, k, extra = {}) => el.dispatchEvent(new globalThis.window.KeyboardEvent('keydown', { key: k, bubbles: true, ...extra }));
