// Static HTML export: render A2UI messages to an HTML string, in Node or the browser.
//
//   import { renderToHTML } from 'bitwrench-a2ui/static';
//   const { html, css } = renderToHTML(messages, { theme: 'ocean' });
//
// The core runs headless (no DOM needed), the same component implementations compose a
// TACO tree with no event handlers, and bitwrench's bw.html() turns it into a string.
// Use it for snapshots, transcripts, email-style previews, server-side first paint and
// golden tests.
import bwDefault from 'bitwrench';

import { NodeResolver, createCore, getValue } from '../core/webcore.js';
import { createBasicCatalog } from '../renderer.js';
import { compose, stripHandlers } from '../render/view.js';
import { themeCss } from '../theme/theme.js';

/**
 * @param {object|object[]} messages  A2UI v1.0 envelopes
 * @param {object} [opts]
 * @param {string} [opts.surfaceId]   render one surface (default: all, in creation order)
 * @param {string|object} [opts.theme]
 * @param {boolean} [opts.includeCss=false]  prepend a <style> element to the html
 * @param {Array} [opts.catalogs]
 * @param {object} [opts.bw]
 * @param {{maxArrayItems?: number, maxDepth?: number}} [opts.limits]  per-message size limits
 * @returns {{html: string, css: string, surfaces: string[], errors: object[], taco: object[]}}
 */
export function renderToHTML(messages, opts = {}) {
  const bw = opts.bw ?? bwDefault;
  const core = createCore({ catalogs: opts.catalogs ?? [createBasicCatalog()], validation: opts.validation, limits: opts.limits, onOutbound: () => {} });
  const errors = [...core.process(messages)];
  const ids = opts.surfaceId ? [opts.surfaceId] : [...core.surfaces().keys()];
  const parts = [];
  const tacos = [];
  for (const id of ids) {
    const surface = core.surface(id);
    if (!surface) { errors.push({ version: '1.0', error: { code: 'NOT_FOUND', surfaceId: id, message: `Surface "${id}" not found` } }); continue; }
    const sub = surface.onError.subscribe(e => errors.push({ version: '1.0', error: { ...e, surfaceId: id } }));
    const resolver = new NodeResolver(surface);
    const root = getValue(resolver.rootNode);
    const taco = root ? stripHandlers(compose(root, { bw, surface, getValue })) : null;
    tacos.push(taco);
    const inner = taco ? bw.html(taco) : '';
    parts.push(`<div class="a2ui-surface" data-surface-id="${bw.escapeHTML(id)}">${inner}</div>`);
    resolver.dispose();
    sub.unsubscribe?.();
  }
  core.dispose();
  const { css } = themeCss(bw, opts.theme);
  const body = parts.join('\n');
  return {
    html: opts.includeCss ? `<style>${css}</style>\n${body}` : body,
    css,
    surfaces: ids,
    errors,
    taco: tacos,
  };
}

/** A complete standalone HTML document for a set of messages. */
export function renderToDocument(messages, opts = {}) {
  const bw = opts.bw ?? bwDefault;
  const { html, css, errors } = renderToHTML(messages, opts);
  const title = bw.escapeHTML(opts.title ?? 'A2UI surface');
  const doc = `<!doctype html>
<html lang="${bw.escapeHTML(opts.lang ?? 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${css}
body{margin:0;padding:16px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}</style>
</head>
<body>
${html}
</body>
</html>
`;
  return { html: doc, errors };
}
