// Every upstream basic catalog example (catalogs/basic/v1/examples, pinned copies in
// test/upstream/examples) must render in the live renderer and to static HTML with no
// errors, and every component in it must produce an element.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { freshMount } from '../helpers/dom.js';

const { createRenderer, renderToHTML } = await import('../../src/index.js');

const dir = new URL('../upstream/examples/', import.meta.url);
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();

describe('upstream golden examples', () => {
  assert.equal(files.length, 43);
  for (const f of files) {
    const ex = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));
    it(`${f}: renders live`, () => {
      const errors = [];
      const r = createRenderer({ mount: freshMount(), onDiagnostic: d => { if (d.level === 'error') errors.push(d); } });
      r.receive(ex.messages);
      // Many examples stream components before their data, so functions briefly see
      // missing values and the core reports EXPRESSION_ERROR until the data arrives.
      // Anything else (validation failures, unknown components, cycles) is a real error.
      const real = errors.filter(e => !(e.source === 'surface' && e.code === 'EXPRESSION_ERROR'));
      assert.deepEqual(real, [], `errors in ${f}`);
      const ids = r.surfaceIds();
      assert.ok(ids.length > 0, 'no surface created');
      for (const id of ids) {
        const tree = r.viewTree(id);
        assert.ok(tree, `no view tree for ${id}`);
        const walk = n => {
          if (n.state === 'resolved') assert.ok(r.host(id).querySelector(`[data-a2ui-id="${n.id}"]`), `component ${n.id} not in DOM`);
          (n.children ?? []).forEach(walk);
        };
        walk(tree);
      }
      // With all data present, a fresh render reports no expression errors at all.
      const settled = [];
      const r2 = createRenderer({ mount: freshMount(), onDiagnostic: d => { if (d.level === 'error') settled.push(d); } });
      r2.receive(dataFirst(ex.messages));
      assert.deepEqual(settled.map(e => e.message), [], `errors with data present in ${f}`);
      r.destroy();
      r2.destroy();
    });
    it(`${f}: renders static HTML`, () => {
      const out = renderToHTML(dataFirst(ex.messages));
      assert.deepEqual(out.errors, [], `errors in ${f}`);
      assert.ok(out.html.includes('data-a2ui-id="root"'), 'root missing from HTML');
      assert.ok(!/\son[a-z]+=/i.test(out.html), 'inline event handler in static HTML');
      assert.ok(!/<script/i.test(out.html), 'script in static HTML');
    });
  }
});

/** Same messages, with each surface's data folded into its createSurface. */
function dataFirst(messages) {
  const data = new Map();
  for (const m of messages) {
    const u = m.updateDataModel;
    if (u && (u.path === undefined || u.path === '/')) data.set(u.surfaceId, u.value);
  }
  return messages.flatMap(m => {
    if (m.createSurface && data.has(m.createSurface.surfaceId)) {
      return [{ ...m, createSurface: { ...m.createSurface, dataModel: { ...(m.createSurface.dataModel ?? {}), ...data.get(m.createSurface.surfaceId) } } }];
    }
    if (m.updateDataModel && data.has(m.updateDataModel.surfaceId) && (m.updateDataModel.path === undefined || m.updateDataModel.path === '/')) return [];
    return [m];
  });
}
