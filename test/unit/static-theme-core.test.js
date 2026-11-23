import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import '../helpers/dom.js';
import { create, data, update } from '../helpers/a2ui.js';

const { renderToHTML, renderToDocument } = await import('../../src/static/index.js');
const { themeCss, resolveThemeConfig, adapterCss, applyTheme, removeTheme } = await import('../../src/theme/theme.js');
const { normalizeMessage, createCore, buildBasicCatalog, VALIDATION, checkLimits, DEFAULT_LIMITS } = await import('../../src/core/webcore.js');
const { compose, stripHandlers, resolvePath, defaultSlots, a11yOf } = await import('../../src/render/view.js');
const { default: bw } = await import('bitwrench');

describe('static HTML', () => {
  const msgs = [create('s', [
    { id: 'root', component: 'Column', children: ['t', 'b', 'f', 'tabs', 'm', 'row'] },
    { id: 't', component: 'Text', text: { '@path': '/greet' }, '@accessibility': { label: 'Greeting', hidden: false } },
    { id: 'b', component: 'Button', child: 'bl', action: { event: { name: 'x' } } }, { id: 'bl', component: 'Text', text: 'Click' },
    { id: 'f', component: 'TextField', label: 'Name', value: { '@path': '/name' } },
    { id: 'tabs', component: 'Tabs', tabs: [{ title: 'A', child: 'ta' }, { title: 'B', child: 'tb' }] }, { id: 'ta', component: 'Text', text: 'first' }, { id: 'tb', component: 'Text', text: 'second' },
    { id: 'm', component: 'Modal', trigger: 'mt', content: 'mc' }, { id: 'mt', component: 'Text', text: 'open' }, { id: 'mc', component: 'Text', text: 'hidden content' },
    { id: 'row', component: 'Row', children: ['w', 'missing'] }, { id: 'w', component: 'Text', text: 'weighted', weight: 1 },
    { id: 'ic', component: 'Icon', name: { '@path': '/icon' } },
  ], { greet: 'Hello <b>there</b>', name: 'Ada', icon: 'home' })];

  it('renders escaped, handler-free HTML with CSS', () => {
    const out = renderToHTML(msgs, { theme: 'forest' });
    assert.deepEqual(out.errors, []);
    assert.deepEqual(out.surfaces, ['s']);
    assert.ok(out.html.includes('Hello &lt;b&gt;there&lt;'), 'raw HTML is escaped text');
    assert.ok(!out.html.includes('<b>'));
    assert.ok(out.html.includes('aria-label="Greeting"'));
    assert.ok(out.html.includes('value="Ada"'));
    assert.ok(out.html.includes('>first<') && !out.html.includes('>second<'), 'only the active tab');
    assert.ok(!out.html.includes('hidden content'), 'closed modal content is not rendered');
    assert.ok(out.html.includes('flex:1 1 0%'));
    assert.ok(!/\son[a-z]+=/.test(out.html));
    assert.ok(out.css.includes('.a2ui-surface'));
    assert.ok(out.taco[0].a['data-a2ui-id'] === 'root');
    assert.ok(renderToHTML(msgs, { includeCss: true }).html.startsWith('<style>'));
  });

  it('reports a missing surface and documents render', () => {
    const out = renderToHTML(msgs, { surfaceId: 'nope' });
    assert.equal(out.errors[0].error.code, 'NOT_FOUND');
    const surfaceless = renderToHTML([create('e', [{ id: 'other', component: 'Text', text: 'no root' }])], { validation: 'relaxed' });
    assert.ok(surfaceless.html.includes('data-surface-id="e"'));
    const doc = renderToDocument(msgs, { title: 'T <x>', lang: 'de' });
    assert.ok(doc.html.startsWith('<!doctype html>'));
    assert.ok(doc.html.includes('<title>T &lt;x&gt;</title>'));
    assert.ok(doc.html.includes('lang="de"'));
    assert.ok(renderToDocument(msgs).html.includes('<title>A2UI surface</title>'));
  });

  it('compose skips unresolved nodes and unknown implementations', () => {
    assert.equal(compose(null, {}), null);
    assert.equal(compose({ state: 'pending' }, {}), null);
    assert.equal(compose({ state: 'resolved', impl: {} }, {}), null);
    assert.equal(compose({ state: 'resolved', impl: { bw: { render: () => ({ t: 'i' }) } }, props: null }, { getValue: () => ({}) }, 99), null);
    const bare = compose({ state: 'resolved', componentId: 'x', type: 'T', impl: { bw: { render: () => ({ t: 'i' }) } } }, { getValue: () => ({}) });
    assert.deepEqual(bare, { t: 'i', a: { 'data-a2ui-id': 'x', 'data-a2ui-type': 'T' } });
    const taco = stripHandlers({ t: 'a', a: { onclick() {}, x: undefined, y: 1 }, o: { mounted() {} }, c: [{ t: 'b', a: { onx() {} } }, 'text'] });
    assert.deepEqual(taco, { t: 'a', a: { y: 1 }, c: [{ t: 'b', a: {} }, 'text'] });
    assert.equal(stripHandlers('s'), 's');
  });

  it('view helpers', () => {
    assert.equal(resolvePath('/a', '/x'), '/a');
    assert.equal(resolvePath('a', '/items/0'), '/items/0/a');
    assert.equal(resolvePath('a', '/items/0/'), '/items/0/a');
    assert.equal(resolvePath('a', '/'), '/a');
    assert.equal(resolvePath('a'), '/a');
    assert.deepEqual(defaultSlots({}), {});
    assert.equal(a11yOf({}), null);
    assert.equal(a11yOf({ accessibility: 'x' }), null);
  });
});

describe('theme', () => {
  it('resolves presets, drops unsafe colors', () => {
    const cfg = resolveThemeConfig(bw, { preset: 'ocean', primary: 'red;}body{x', secondary: '#123456' });
    assert.equal(cfg.primary, bw.THEME_PRESETS.ocean.primary);
    assert.equal(cfg.secondary, '#123456');
    assert.deepEqual(resolveThemeConfig(bw, undefined), {});
    assert.ok(resolveThemeConfig(bw, 'teal').primary);
    assert.deepEqual(resolveThemeConfig({}, { preset: 'x', danger: 'nope' }), {});
  });

  it('produces CSS with variables for light and dark', () => {
    const { css, styles } = themeCss(bw, { primary: '#0b6e4f' });
    assert.ok(css.includes('--a2ui-color-primary'));
    assert.ok(css.includes('.bw_theme_alt'));
    assert.ok(styles.palette.primary.base);
    assert.ok(adapterCss(bw).includes('.a2ui-row'));
    const noAlt = themeCss({ ...bw, makeStyles: c => ({ ...bw.makeStyles(c), alternatePalette: null, alternateCss: '' }), css: bw.css }, {});
    assert.ok(!noAlt.css.includes('.bw_theme_alt .a2ui-surface'));
  });

  it('applies and removes per-surface themes, re-injecting adapter CSS if removed', () => {
    const host = document.createElement('div');
    host.id = 'theme-host';
    document.body.appendChild(host);
    applyTheme(bw, host, 'slate');
    assert.ok(document.getElementById('a2ui-vars-theme-host'));
    document.getElementById('a2ui-adapter-css')?.remove();
    applyTheme(bw, host, 'slate');
    assert.ok(document.getElementById('a2ui-adapter-css'));
    removeTheme(bw, host);
    assert.equal(document.getElementById('a2ui-vars-theme-host'), null);
    removeTheme({}, host);
    applyTheme({ ...bw, loadStructural: undefined }, host, {});
  });
});

describe('core wrapper', () => {
  it('drops createSurface.theme outside strict mode and leaves everything else alone', () => {
    // web_core 0.16 reads the v1.0 @ envelope keys itself: they pass through unchanged.
    const comp = { id: 'a', component: 'Text', text: 'x', '@checks': [], '@accessibility': { label: 'l' }, '@catalogId': 'c', '@metadata': {} };
    assert.deepEqual(normalizeMessage(create('s', [comp])).createSurface.components[0], comp);
    assert.deepEqual(normalizeMessage({ messages: [data('s', '/x', 1)] }).messages[0], data('s', '/x', 1));
    assert.deepEqual(normalizeMessage([data('s', '/x', 1)]), [data('s', '/x', 1)]);
    assert.equal(normalizeMessage(null), null);
    assert.equal(normalizeMessage('x'), 'x');
    const kept = normalizeMessage({ version: '1.0', createSurface: { surfaceId: 's', theme: {} } });
    assert.ok('theme' in kept.createSurface, 'kept without dropTheme (strict mode)');
    let dropped;
    const themed = normalizeMessage({ version: '1.0', createSurface: { surfaceId: 's', theme: {}, catalogId: 'c' } }, { dropTheme: true, onDrop: id => { dropped = id; } });
    assert.deepEqual(themed.createSurface, { surfaceId: 's', catalogId: 'c' });
    assert.equal(dropped, 's');
    assert.ok(!('theme' in normalizeMessage({ version: '1.0', createSurface: { surfaceId: 's', theme: {} } }, { dropTheme: true }).createSurface));
    const plain = { version: '1.0', createSurface: { surfaceId: 's' } };
    assert.equal(normalizeMessage(plain, { dropTheme: true }), plain);
    assert.deepEqual(normalizeMessage({ version: '1.0', updateComponents: { surfaceId: 's' } }), { version: '1.0', updateComponents: { surfaceId: 's' } });
  });

  it('web_core rejects a component that sends both spellings of an envelope key, as v1.0 requires', () => {
    const core = createCore({ catalogs: [buildBasicCatalog({})], validation: 'relaxed', onOutbound: () => {} });
    const errs = core.process(create('s', [{ id: 'root', component: 'Text', text: 'x', checks: [], '@checks': [] }]));
    assert.equal(errs[0]?.error?.code, 'VALIDATION_FAILED');
    core.dispose();
  });

  it('measures message size: total array items and depth (GHSA-mrhx-c7xc-m3w5)', () => {
    assert.equal(checkLimits(create('s', [{ id: 'root', component: 'Text', text: 'x' }])), null);
    assert.equal(checkLimits(null), null);
    assert.deepEqual(DEFAULT_LIMITS, { maxArrayItems: 10000, maxDepth: 64 });
    const wide = update('s', Array.from({ length: 11 }, (_, i) => ({ id: `c${i}` })));
    assert.deepEqual(checkLimits(wide, { maxArrayItems: 10 }), { path: '/updateComponents/components', message: 'message has more than 10 array items in total' });
    // Items add up across arrays.
    assert.ok(checkLimits({ a: [1, 2, 3], b: [[1, 2], [3]] }, { maxArrayItems: 7 }));
    assert.equal(checkLimits({ a: [1, 2, 3], b: [[1, 2], [3]] }, { maxArrayItems: 8 }), null);
    let deep = {};
    for (let i = 0; i < 70; i++) deep = { d: deep };
    assert.match(checkLimits(deep).message, /nested more than 64 levels/);
    assert.equal(checkLimits(deep, { maxDepth: 100 }), null);
  });

  it('rejects oversized messages before the core sees them, and processes the rest', () => {
    const core = createCore({ catalogs: [buildBasicCatalog({})], limits: { maxArrayItems: 5 }, onOutbound: () => {} });
    const big = update('s', Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, component: 'Text', text: 'x' })));
    const errors = core.process([create('s', [{ id: 'root', component: 'Text', text: 'hi' }]), big]);
    assert.equal(errors.length, 1);
    assert.deepEqual(errors[0], { version: '1.0', error: { code: 'VALIDATION_FAILED', surfaceId: 's', path: '/updateComponents/components',
      message: 'Message rejected before validation: message has more than 5 array items in total.' } });
    assert.ok(core.surface('s'));
    assert.equal(core.surface('s').componentsModel.get('c0'), undefined);
    // No surfaceId to report, the whole message as the path, {messages} input, all rejected.
    let deep = {};
    for (let i = 0; i < 70; i++) deep = { d: deep };
    const [e] = core.process({ messages: [deep] });
    assert.equal(e.error.surfaceId, undefined);
    assert.equal(core.process(['not an object']).length, 1);
    const root = core.process([Array.from({ length: 6 })]);
    assert.equal(root[0].error.path, '/');
    core.dispose();
  });

  it('createCore with a custom validation object and capabilities', () => {
    const core = createCore({ catalogs: [buildBasicCatalog({})], validation: VALIDATION.relaxed, onOutbound: () => {} });
    assert.ok(core.capabilities()['1.0']);
    assert.equal(core.surface('x'), undefined);
    core.dispose();
    const plain = createCore({ catalogs: [buildBasicCatalog({})], onOutbound: () => {} });
    plain.dispose();
  });
});
