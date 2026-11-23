// Edge cases: custom component contracts, renderer bookkeeping, core wrapper fallbacks.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { freshMount, tick } from '../helpers/dom.js';
import { create, update, data, render, fire, BASIC_CATALOG_ID } from '../helpers/a2ui.js';
import { Catalog } from '@a2ui/web_core/v1_0';

const { createRenderer, createBasicCatalog, component, buildCatalog, makeFunction, renderToHTML } = await import('../../src/index.js');
const { frameError, frameAction } = await import('../../src/renderer.js');
const { normalizeMessage, createCore, buildBasicCatalog } = await import('../../src/core/webcore.js');

const CUSTOM_ID = 'https://example.test/custom.json';
const customCatalog = impls => buildCatalog({
  catalogId: CUSTOM_ID, protocolVersion: '1.0',
  components: {
    Box: { type: 'object', properties: { component: { const: 'Box' }, child: { $ref: 'common_types.json#/$defs/ComponentId' }, label: { $ref: 'common_types.json#/$defs/DynamicString' } }, required: ['component'] },
  },
}, impls);
const box = (impls, comps, dm) => {
  const mount = freshMount();
  const r = createRenderer({ mount, catalogs: [createBasicCatalog(), customCatalog(impls)] });
  r.receive({ version: '1.0', createSurface: { surfaceId: 's', catalogId: CUSTOM_ID, components: comps, ...(dm ? { dataModel: dm } : {}) } });
  return { r, mount };
};

describe('custom component contracts', () => {
  it('a slot named but not rendered, a11yTarget returning null, custom unmount, double dispose', () => {
    let unmounted = 0;
    const Box = component({
      render: () => ({ t: 'section' }),                       // no ctx.slot(): the child slot is never rendered
      slots: p => ({ child: p.child }),
      a11yTarget: () => null,
      unmount: () => { unmounted++; },
    });
    const { r, mount } = box({ Box }, [
      { id: 'root', component: 'Box', child: 'kid', '@accessibility': { label: 'Boxed' } },
      { id: 'kid', component: 'Text', '@catalogId': BASIC_CATALOG_ID, text: 'never shown' },
    ]);
    const section = mount.querySelector('section');
    assert.equal(section.getAttribute('aria-label'), 'Boxed', 'falls back to the root element');
    assert.ok(!mount.textContent.includes('never shown'));
    assert.deepEqual(r.debug.rootView().children(), []);
    const view = r.debug.rootView();
    r.destroy();
    assert.equal(unmounted, 1);
    view.dispose();                                          // already disposed: no-op
  });

  it('removes aria attributes when the accessibility label is cleared', () => {
    const Box = component({ render: () => ({ t: 'div', c: 'box' }), update: () => true });
    const { r, mount } = box({ Box }, [{ id: 'root', component: 'Box', '@accessibility': { label: { '@path': '/l' }, description: { '@path': '/d' } } }], { l: 'Hi', d: 'Desc' });
    const el = mount.querySelector('[data-a2ui-id="root"]');
    assert.equal(el.getAttribute('aria-label'), 'Hi');
    r.receive(data('s', '/l', ''));
    r.receive(data('s', '/d', ''));
    assert.equal(el.getAttribute('aria-label'), null);
    assert.equal(el.getAttribute('aria-description'), null);
  });

  it('ctx.read reads a binding a custom component finds inside its own props, live and static', () => {
    // web_core resolves declared bindings; a binding nested in a free-form value stays raw,
    // and ctx.read resolves it against the data model (reactively when live).
    const Box = component({
      render: (p, ctx) => ({ t: 'output', c: String(ctx.read({ '@path': '/x' })) }),
      update: (el, p, prev, ctx) => { el.textContent = String(ctx.read({ '@path': '/x' })); return true; },
    });
    const { r, mount } = box({ Box }, [{ id: 'root', component: 'Box', label: 'l' }], { x: 'one' });
    assert.equal(mount.querySelector('output').textContent, 'one');
    const out = renderToHTML([{ version: '1.0', createSurface: { surfaceId: 's', catalogId: CUSTOM_ID, components: [{ id: 'root', component: 'Box' }], dataModel: { x: 'static' } } }],
      { catalogs: [createBasicCatalog(), customCatalog({ Box })] });
    assert.ok(out.html.includes('>static</output>'));
    r.destroy();
  });

  it('static compose of a component whose render has no attributes', () => {
    const Box = component({ render: () => ({ t: 'aside', c: 'static box' }) });
    const out = renderToHTML([{ version: '1.0', createSurface: { surfaceId: 's', catalogId: CUSTOM_ID, components: [{ id: 'root', component: 'Box' }] } }],
      { catalogs: [createBasicCatalog(), customCatalog({ Box })] });
    assert.ok(out.html.includes('<aside data-a2ui-id="root" data-a2ui-type="Box">static box</aside>'));
  });
});

describe('renderer bookkeeping', () => {
  it('frames errors and actions', () => {
    assert.deepEqual(frameError({ code: 'X', message: 'm', path: '/a' }, 's'), { version: '1.0', error: { code: 'X', message: 'm', surfaceId: 's', path: '/a' } });
    assert.deepEqual(frameError({ code: 'X', message: 'm', functionCallId: 'f' }, 's').error, { code: 'X', message: 'm', functionCallId: 'f' });
    assert.deepEqual(frameError({ code: 'X', message: 'm', details: { functionCallId: 'g' } }, 's').error.functionCallId, 'g');
    const a = frameAction({ name: 'n', surfaceId: 's', sourceComponentId: 'c', timestamp: 't', context: {}, userMessage: 'u', metadata: { extensions: {} } });
    assert.equal(a.action.userMessage, 'u');
    assert.deepEqual(a.action.metadata, { extensions: {} });
  });

  it('keeps a bounded outbound history and survives non-Error send failures', () => {
    const diags = [];
    let n = 0;
    const r = createRenderer({ mount: freshMount(), send() { n++; if (n > 205) throw 'string failure'; }, onDiagnostic: d => diags.push(d) });
    for (let i = 0; i < 210; i++) r.receive(update('missing', []));
    assert.equal(r.outbound().length, 200);
    assert.ok(diags.some(d => d.code === 'SEND_FAILED' && d.message === 'string failure'));
    assert.ok(r.capabilities()['1.0']);
  });

  it('replacing the root component re-binds the root view; inspect before a root exists', () => {
    const t = render([{ id: 'root', component: 'Text', text: 'one' }]);
    t.setComponents([{ id: 'root', component: 'Card', child: 'c' }, { id: 'c', component: 'Text', text: 'two' }]);
    assert.equal(t.r.host().textContent, 'two');
    const r = createRenderer({ mount: freshMount(), validation: 'relaxed' });
    r.receive(create('x', [{ id: 'notroot', component: 'Text', text: 'x' }]));
    assert.equal(r.inspect('x').taco, null);
  });
});

describe('component edge cases', () => {
  it('Text update with unchanged text keeps the element', () => {
    const t = render([{ id: 'root', component: 'Row', children: ['t'] }, { id: 't', component: 'Text', text: 'same', weight: 1 }]);
    const el = t.el('t');
    t.setComponents([{ id: 't', component: 'Text', text: 'same', weight: 2 }]);
    assert.equal(t.el('t'), el);
    assert.equal(t.view('t').holder.style.flex, '2 1 0%');
  });

  it('media without poster, blocked audio URL, caption cleared', () => {
    const t = render([{ id: 'root', component: 'Column', children: ['v', 'a'] }, { id: 'v', component: 'Video', url: 'https://x.example/v.mp4' },
      { id: 'a', component: 'AudioPlayer', url: { '@path': '/a' }, description: { '@path': '/d' } }], { a: 'https://x.example/a.mp3', d: 'Ep' });
    assert.equal(t.el('v').getAttribute('poster'), null);
    const bad = render([{ id: 'root', component: 'Video', url: 'javascript:alert(1)' }]);
    assert.equal(bad.el('root').getAttribute('src'), null);
    t.setData('/a', 'javascript:x');
    assert.equal(t.el('a').querySelector('audio').getAttribute('src'), null);
    t.setData('/d', '');
    assert.equal(t.el('a').querySelector('figcaption').style.display, 'none');
  });

  it('hints appear and disappear on update', () => {
    const t = render([{ id: 'root', component: 'TextField', label: 'L', value: '', checks: [{ condition: { '@path': '/h' } }] }], { h: true });
    const hints = t.el('root').querySelector('.a2ui-hints');
    assert.equal(hints.style.display, 'none');
    t.setData('/h', { valid: false, message: 'Heads up', severity: 'info' });
    assert.equal(hints.style.display, '');
    assert.equal(hints.textContent, 'Heads up');
    t.setData('/h', true);
    assert.equal(hints.style.display, 'none');
  });

  it('ChoicePicker with missing, scalar and literal values; labelled filter', () => {
    const t = render([
      { id: 'root', component: 'Column', children: ['m', 's', 'lit'] },
      { id: 'm', component: 'ChoicePicker', options: [{ label: 'A', value: 'a' }], value: { '@path': '/missing' } },
      { id: 's', component: 'ChoicePicker', label: 'Filtered', filterable: true, options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }], value: { '@path': '/scalar' } },
      { id: 'lit', component: 'ChoicePicker', options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }], value: ['a'] },
    ], { scalar: 'b' });
    assert.equal(t.el('m').querySelector('input').checked, false);
    assert.equal(t.el('s').querySelectorAll('input.a2ui-option-input')[1].checked, true);
    assert.equal(t.el('s').querySelector('.a2ui-choice-filter').getAttribute('aria-label'), 'Filter Filtered');
    const b = t.el('lit').querySelectorAll('input')[1];
    b.checked = true;
    fire(b, 'change');                                      // literal value: nothing to write
    assert.deepEqual(t.view('lit').p.value.value, ['a']);
  });

  it('Slider bound to a missing value starts at zero', () => {
    const t = render([{ id: 'root', component: 'Slider', max: 10, label: { '@path': '/l' }, value: { '@path': '/missing' } }], { l: 'a' });
    t.setData('/l', 'b');                                  // update while the value is still missing
    assert.equal(t.el('root').querySelector('.bw_range_value').textContent, '0');
    t.setData('/missing', 3);
    assert.equal(t.el('root').querySelector('input').value, '3');
  });
});

describe('core wrapper fallbacks', () => {
  it('default onNote, raw catalogs, non-array components', () => {
    const raw = new Catalog('https://example.test/raw.json', '1.0', [], []);
    const core = createCore({ catalogs: [buildBasicCatalog({}), raw], validation: 'relaxed', onOutbound: () => {} });
    const errs = core.process(create('s', [{ id: 'root', component: 'Text', text: 'x' }], undefined, { theme: {} }));
    assert.deepEqual(errs, []);
    core.dispose();
    const odd = normalizeMessage({ version: '1.0', updateComponents: { surfaceId: 's', components: 'nope' } });
    assert.equal(odd.updateComponents.components, 'nope');
  });

  it('a declared function without an implementation stays schema-only, for web_core to route to the agent', () => {
    const catalog = buildCatalog({ catalogId: 'https://example.test/a.json', protocolVersion: '1.0', components: {},
      functions: { far: { type: 'object', returnType: 'string', properties: { '@call': { const: 'far' }, args: { type: 'object' } }, required: ['@call'] } } });
    const fn = catalog.functions.get('far');
    assert.equal(fn.name, 'far');
    assert.equal(typeof fn.execute, 'undefined');
    const mine = makeFunction({ name: 'far', execute: () => 'local' });
    assert.equal(buildCatalog({ catalogId: 'https://example.test/b.json', protocolVersion: '1.0', components: {}, functions: { far: {} } }, {}, [mine]).functions.get('far').execute(), 'local');
  });

  it('static export reports an agent function it cannot call (there is no agent), once', () => {
    const catalog = buildCatalog({ catalogId: 'https://example.test/s.json', protocolVersion: '1.0', components: {},
      functions: { far: { type: 'object', returnType: 'string', properties: { '@call': { const: 'far' }, args: { type: 'object' } }, required: ['@call'] } } });
    const out = renderToHTML([create('s', [{ id: 'root', component: 'Text', text: { '@call': 'far', catalogId: 'https://example.test/s.json' } }])], { catalogs: [createBasicCatalog(), catalog] });
    assert.ok(out.html.includes('data-a2ui-id="root"'));
    assert.equal(out.errors.length, 1);
    assert.equal(out.errors[0].error.code, 'EXPRESSION_ERROR');
    assert.match(out.errors[0].error.message, /far/);
  });
});

await tick();
