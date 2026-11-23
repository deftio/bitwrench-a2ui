// Messages are values: the renderer never writes into what it receives or what it sent.
// web_core keeps createSurface/updateDataModel data-model objects and writes user edits
// into them, so without copies a message log, a fixture or a replay buffer would change
// as the user types (found on the site's inspector, 0.9.3).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { tick, freshMount } from '../helpers/dom.js';
import { create, data, fire, BASIC_CATALOG_ID } from '../helpers/a2ui.js';

const { createRenderer, renderToHTML } = await import('../../src/index.js');
const { detach } = await import('../../src/core/webcore.js');

const components = [
  { id: 'root', component: 'Column', children: ['name', 'go'] },
  { id: 'name', component: 'TextField', label: 'Name', value: { '@path': '/form/name' } },
  { id: 'go', component: 'Button', child: 'goLabel', action: { event: { name: 'book', context: { form: { '@path': '/form' }, name: { '@path': '/form/name' } } } } },
  { id: 'goLabel', component: 'Text', text: 'Book' },
];
const fixture = () => [
  create('s', components, { form: { name: '', tags: ['a'] } }, { sendDataModel: true }),
  data('s', '/form/tags', ['a', 'b']),
];

function mount(messages) {
  const sent = [];
  const r = createRenderer({ mount: freshMount(), send: (m, meta) => sent.push({ m, meta }) });
  r.receive(messages);
  const input = () => r.debug.findView('name').el.querySelector('input');
  const type = value => { const el = input(); el.value = value; fire(el, 'input'); };
  return { r, sent, input, type, click: () => r.debug.findView('go').el.click() };
}

describe('message history stays as received and as sent', () => {
  it('typing changes the model, not the received messages', async () => {
    const wire = fixture();
    const asReceived = structuredClone(wire);
    const t = mount(wire);
    t.type('Ada');
    assert.equal(t.r.surface('s').dataModel.get('/form/name'), 'Ada');
    assert.deepEqual(wire, asReceived, 'createSurface and updateDataModel are unchanged');

    t.click();
    await tick();
    const action = t.sent.find(s => s.m.action);
    assert.equal(action.m.action.context.name, 'Ada');
    assert.deepEqual(action.m.action.context.form, { name: 'Ada', tags: ['a', 'b'] });
    assert.equal(action.meta.a2uiRendererDataModel.surfaces.s.form.name, 'Ada');
    const asSent = structuredClone(action);

    t.type('Grace');
    assert.deepEqual(action, asSent, 'a sent action and its metadata keep the values they were sent with');
    const kept = t.r.outbound().find(m => m.action);
    assert.equal(kept.action.context.name, 'Ada', 'the inspector copy is a snapshot too');
    assert.deepEqual(wire, asReceived);
  });

  it('replaying the same fixture starts from the original values', () => {
    const wire = fixture();
    mount(wire).type('edited');
    const replay = mount(wire);
    assert.equal(replay.input().value, '');
    assert.equal(replay.r.surface('s').dataModel.get('/form/name'), '');
  });

  it('copies without structuredClone too (jsdom windows lack it)', () => {
    const saved = globalThis.structuredClone;
    globalThis.structuredClone = undefined;
    try {
      const msg = { a: { b: [1, { c: 'x' }] } };
      const copy = detach(msg);
      assert.deepEqual(copy, msg);
      assert.notEqual(copy.a, msg.a);
    } finally {
      globalThis.structuredClone = saved;
    }
    assert.equal(detach(null), null);
    assert.equal(detach(undefined), undefined);
    assert.equal(detach('s'), 's');
    const nested = { x: { y: 1 } };
    assert.notEqual(detach(nested).x, nested.x);
  });

  it('static rendering does not write into its input either', () => {
    const wire = [create('t', [{ id: 'root', component: 'Text', text: { '@path': '/x' } }], { x: 'hi' }), data('t', '/y', { z: 1 })];
    const before = structuredClone(wire);
    assert.ok(renderToHTML(wire).html.includes('hi'));
    assert.deepEqual(wire, before);
    assert.equal(wire[0].createSurface.catalogId, BASIC_CATALOG_ID);
  });
});
