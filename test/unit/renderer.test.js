import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { window as w, freshMount, tick } from '../helpers/dom.js';
import { create, update, data, del, render, BASIC_CATALOG_ID } from '../helpers/a2ui.js';

const lib = await import('../../src/index.js');
const { createRenderer, createBasicCatalog, component, makeFunction, buildCatalog, viewTree, VERSION } = lib;

describe('createRenderer', () => {
  it('mount by selector, missing selector throws, headless works', () => {
    freshMount('target');
    const r = createRenderer({ mount: '#target' });
    r.receive(create('s', [{ id: 'root', component: 'Text', text: 'hi' }]));
    assert.equal(w.document.querySelector('#target .a2ui-surface').textContent, 'hi');
    r.destroy();
    assert.throws(() => createRenderer({ mount: '#nope' }), /not found/);
    const headless = createRenderer({});
    headless.receive(create('h', [{ id: 'root', component: 'Text', text: 'x' }]));
    assert.deepEqual(headless.surfaceIds(), ['h']);
    assert.equal(headless.host('h'), null);
    assert.equal(headless.viewTree('h'), null);
    assert.equal(headless.inspect('h').viewTree, null);
    assert.ok(headless.inspect('h').taco);
    headless.destroy();
  });

  it('sends errors for invalid messages with metadata, and reports diagnostics', () => {
    const t = render([{ id: 'root', component: 'Text', text: 'x' }]);
    const errs = t.r.receive(update('missing', [{ id: 'root', component: 'Text', text: 'y' }]));
    assert.equal(errs.length, 1);
    assert.equal(t.sent.at(-1).m.error.code, 'INTEGRITY_ERROR');
    assert.ok(t.sent.at(-1).meta.a2uiRendererCapabilities['1.0'].supportedCatalogIds.includes(BASIC_CATALOG_ID));
    assert.ok(t.diags.some(d => d.source === 'process' && d.code === 'INTEGRITY_ERROR'));
    assert.equal(t.r.outbound().at(-1).error.code, 'INTEGRITY_ERROR');
  });

  it('sendDataModel attaches the surface data model to outbound metadata', async () => {
    const t = render([{ id: 'root', component: 'Button', child: 'l', action: { event: { name: 'x' } } }, { id: 'l', component: 'Text', text: 'x' }], { a: 1 }, { surface: { sendDataModel: true } });
    t.el('root').click();
    await tick();
    assert.deepEqual(t.sent.at(-1).meta.a2uiRendererDataModel.surfaces.s, { a: 1 });
    const noCaps = createRenderer({ mount: freshMount(), includeCapabilities: false });
    assert.deepEqual(noCaps.metadata(), {});
  });

  it('an error reported by the surface and by processing is sent once', () => {
    const t = render([{ id: 'root', component: 'Text', text: 'x' }]);
    t.sent.length = 0;
    t.r.receive(update('s', [{ id: 'root', component: 'Text', text: { '@call': 'formatNumber', args: { value: 'nope', bogus: 1 } } }]));
    const errors = t.sent.filter(s => s.m.error);
    const keys = errors.map(s => `${s.m.error.code}|${s.m.error.message}`);
    assert.equal(new Set(keys).size, keys.length, `duplicates: ${JSON.stringify(keys)}`);
  });

  it('a throwing send is reported, not thrown', () => {
    const diags = [];
    const r = createRenderer({ mount: freshMount(), send() { throw new Error('offline'); }, onDiagnostic: d => diags.push(d) });
    r.receive(update('missing', []));
    assert.ok(diags.some(d => d.code === 'SEND_FAILED' && /offline/.test(d.message)));
  });

  it('theme, theme mode, reset and destroy', () => {
    const mount = freshMount();
    const r = createRenderer({ mount, theme: 'ocean' });
    r.setThemeMode('dark');
    r.receive([create('a', [{ id: 'root', component: 'Text', text: 'a' }]), create('b', [{ id: 'root', component: 'Text', text: 'b' }])]);
    const hosts = mount.querySelectorAll('.a2ui-surface');
    assert.equal(hosts.length, 2);
    assert.ok(hosts[0].classList.contains('bw_theme_alt'));
    assert.equal(r.setThemeMode('light'), 'light');
    assert.ok(!hosts[0].classList.contains('bw_theme_alt'));
    globalThis.matchMedia = () => ({ matches: true });
    assert.equal(r.setThemeMode('auto'), 'dark');
    delete globalThis.matchMedia;
    assert.equal(r.setThemeMode('auto'), 'light');
    r.setTheme({ primary: '#336699' });
    assert.ok(w.document.getElementById(`a2ui-vars-${hosts[0].id}`).textContent.includes('#336699'));
    r.reset();
    assert.deepEqual(r.surfaceIds(), []);
    assert.equal(mount.querySelectorAll('.a2ui-surface').length, 0);
    r.receive(create('c', [{ id: 'root', component: 'Text', text: 'c' }]));
    r.destroy();
    assert.equal(mount.querySelectorAll('.a2ui-surface').length, 0);
    assert.equal(r.protocolVersion, '1.0');
    assert.equal(r.version, lib.VERSION);
    assert.equal(lib.getVersion(), lib.VERSION);
    assert.equal(r.catalogId, BASIC_CATALOG_ID);
    assert.ok(r.processor);
  });

  it('inspect, viewTree and debug helpers', () => {
    const t = render([{ id: 'root', component: 'Column', children: ['a'] }, { id: 'a', component: 'TextField', label: 'L', value: 'v' }], { k: 1 });
    const snap = t.r.inspect();
    assert.equal(snap.surfaceId, 's');
    assert.equal(snap.catalogId, BASIC_CATALOG_ID);
    assert.deepEqual(snap.dataModel, { k: 1 });
    assert.equal(snap.viewTree.children[0].value, 'v');
    assert.equal(snap.taco.a['data-a2ui-id'], 'root');
    assert.equal(t.r.inspect('nope'), null);
    assert.equal(t.r.viewTree('nope'), null);
    assert.equal(t.r.debug.rootView('nope'), null);
    assert.equal(t.r.debug.findView('zzz'), null);
    assert.equal(t.r.host().className, 'a2ui-surface');
    assert.equal(t.r.surface().id, 's');
    t.r.debug.unmount();
    t.r.debug.unmount('s');            // already unmounted
    assert.equal(t.mount.querySelector('.a2ui-surface'), null);
  });

  it('receiveStream reads JSONL and reports bad lines', async () => {
    const diags = [];
    const got = [];
    const r = createRenderer({ mount: freshMount(), onDiagnostic: d => diags.push(d) });
    const jsonl = `${JSON.stringify(create('s', [{ id: 'root', component: 'Text', text: 'streamed' }]))}\nnot json\n`;
    await r.receiveStream(jsonl, { onMessage: m => got.push(m) });
    assert.equal(r.host('s').textContent, 'streamed');
    assert.equal(got.length, 1);
    assert.ok(diags.some(d => d.code === 'JSONL_PARSE'));
    await r.receiveStream(`${JSON.stringify(data('s', '/x', 1))}\n`);
  });

  it('a component with no implementation is reported and renders nothing', () => {
    const catalog = buildCatalog({ catalogId: 'https://example.test/c.json', protocolVersion: '1.0',
      components: { Widget: { type: 'object', properties: { component: { const: 'Widget' } }, required: ['component'] } } }, {});
    const diags = [];
    const r = createRenderer({ mount: freshMount(), catalogs: [catalog], onDiagnostic: d => diags.push(d) });
    r.receive({ version: '1.0', createSurface: { surfaceId: 's', catalogId: 'https://example.test/c.json', components: [{ id: 'root', component: 'Widget' }] } });
    assert.ok(diags.some(d => d.code === 'NO_IMPLEMENTATION'));
    assert.equal(r.host('s').querySelector('[data-a2ui-id]'), null);
  });

  it('strict validation reports a theme, relaxed drops it with a warning', () => {
    const strict = createRenderer({ mount: freshMount(), validation: 'strict' });
    const errs = strict.receive(create('s', [{ id: 'root', component: 'Text', text: 'x' }], undefined, { theme: { primaryColor: '#f00' } }));
    assert.equal(errs.length, 1);
    const diags = [];
    const relaxed = createRenderer({ mount: freshMount(), validation: 'relaxed', onDiagnostic: d => diags.push(d) });
    relaxed.receive(create('s', [{ id: 'root', component: 'Text', text: 'x' }], undefined, { theme: { primaryColor: '#f00' } }));
    assert.ok(diags.some(d => d.code === 'THEME_DROPPED'));
    assert.equal(relaxed.host('s').textContent, 'x');
  });

  it('deleteSurface removes the host, other surfaces stay', () => {
    const mount = freshMount();
    const r = createRenderer({ mount });
    r.receive([create('a', [{ id: 'root', component: 'Text', text: 'a' }]), create('b', [{ id: 'root', component: 'Text', text: 'b' }])]);
    r.receive(del('a'));
    assert.deepEqual(r.surfaceIds(), ['b']);
    assert.equal(mount.textContent, 'b');
  });

  it('custom components through createBasicCatalog and component()', () => {
    const Hello = component({ render: p => ({ t: 'b', c: `hi ${p.text?.value ?? ''}` }) });
    const r = createRenderer({ mount: freshMount(), catalogs: [createBasicCatalog({ components: { Text: Hello } })] });
    r.receive(create('s', [{ id: 'root', component: 'Text', text: 'bob' }]));
    assert.equal(r.host('s').querySelector('b').textContent, 'hi bob');
    assert.throws(() => component({}), /render/);
    assert.throws(() => component({ render() {}, update: 1 }), /update/);
  });

  it('makeFunction validates its input and works as a local action', async () => {
    assert.throws(() => makeFunction({}), /name/);
    assert.throws(() => makeFunction({ name: 'x' }), /execute/);
    const fn = makeFunction({ name: 'bump', description: 'adds one', allowedCallers: 'rendererOrAgent', requiresUserActivation: false,
      args: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      execute: (args, ctx) => ctx.dataModel.set(args.path, (ctx.dataModel.get(args.path) ?? 0) + 1) });
    const gated = makeFunction({ name: 'gated', requiresUserActivation: true, execute: () => {} });
    assert.equal(gated.requiresUserActivation, true);
    const r = createRenderer({ mount: freshMount(), catalogs: [createBasicCatalog({ functions: [fn, gated] })] });
    r.receive(create('s', [{ id: 'root', component: 'Button', child: 'l', action: { functionCall: { '@call': 'bump', args: { path: '/n' } } } }, { id: 'l', component: 'Text', text: 'x' }], { n: 1 }));
    r.debug.findView('root').el.click();
    await tick();
    assert.equal(r.surface('s').dataModel.get('/n'), 2);
  });

  it('agent functions route through callAgentFunction and resolve', async () => {
    const sent = [];
    const catalog = buildCatalog({ catalogId: 'https://example.test/fn.json', protocolVersion: '1.0', components: {},
      functions: {
        lookup: { type: 'object', returnType: 'string', allowedCallers: 'rendererOrAgent', properties: { '@call': { const: 'lookup' }, args: { type: 'object', properties: { q: { type: 'string' } } } }, required: ['@call'] },
        secret: { type: 'object', returnType: 'string', allowedCallers: 'agentOnly', properties: { '@call': { const: 'secret' }, args: { type: 'object' } }, required: ['@call'] },
      } });
    const r = createRenderer({ mount: freshMount(), catalogs: [createBasicCatalog(), catalog], send: m => sent.push(m) });
    r.receive(create('s', [{ id: 'root', component: 'Text', text: { '@call': 'lookup', catalogId: 'https://example.test/fn.json', args: { q: 'a' } } }]));
    await tick();
    const calls = sent.filter(m => m.callAgentFunction);
    assert.equal(calls.length, 1, 'identical reactive calls are shared');
    const call = calls[0];
    r.receive({ version: '1.0', agentFunctionResponse: { functionCallId: call.callAgentFunction.functionCallId, value: 'from agent' } });
    await tick();
    assert.equal(r.host('s').textContent, 'from agent');
  });

  it('viewTree reports non-resolved nodes and exports', () => {
    const t = render([{ id: 'root', component: 'Column', children: ['missing'] }]);
    const tree = t.r.viewTree();
    assert.equal(tree.children[0].state, 'pending');
    assert.equal(tree.children[0].occupiesLayout, false);
    assert.equal(typeof viewTree, 'function');
    assert.equal(VERSION, JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version);
    assert.ok(lib.ICONS.home && lib.ICON_VIEWBOX);
  });
});
