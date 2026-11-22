import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import '../helpers/dom.js';
import { create, data } from '../helpers/a2ui.js';

const { renderToHTML, renderToDocument } = await import('../../src/static/index.js');
const { themeCss, resolveThemeConfig, adapterCss, applyTheme, removeTheme } = await import('../../src/theme/theme.js');
const { normalizeMessage, createCore, buildBasicCatalog, VALIDATION } = await import('../../src/core/webcore.js');
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
  it('normalizes envelope keys, leaves conflicts and other messages alone', () => {
    const m = normalizeMessage(create('s', [{ id: 'a', component: 'Text', text: 'x', '@checks': [], '@accessibility': { label: 'l' }, '@catalogId': 'c', '@metadata': {} }]));
    assert.deepEqual(Object.keys(m.createSurface.components[0]).sort(), ['accessibility', 'catalogId', 'checks', 'component', 'id', 'metadata', 'text']);
    const both = normalizeMessage({ version: '1.0', updateComponents: { surfaceId: 's', components: [{ id: 'a', checks: [], '@checks': [] }, 'junk', [1]] } });
    assert.ok('@checks' in both.updateComponents.components[0]);
    assert.equal(both.updateComponents.components[1], 'junk');
    assert.deepEqual(normalizeMessage({ messages: [data('s', '/x', 1)] }).messages[0], data('s', '/x', 1));
    assert.deepEqual(normalizeMessage([data('s', '/x', 1)]), [data('s', '/x', 1)]);
    assert.equal(normalizeMessage(null), null);
    assert.equal(normalizeMessage('x'), 'x');
    const noComps = normalizeMessage({ version: '1.0', createSurface: { surfaceId: 's', theme: {} } });
    assert.ok('theme' in noComps.createSurface);
    let dropped;
    const themed = normalizeMessage({ version: '1.0', createSurface: { surfaceId: 's', theme: {} } }, { dropTheme: true, onDrop: id => { dropped = id; } });
    assert.ok(!('theme' in themed.createSurface));
    assert.equal(dropped, 's');
    normalizeMessage({ version: '1.0', createSurface: { surfaceId: 's', theme: {} } }, { dropTheme: true });
    assert.deepEqual(normalizeMessage({ version: '1.0', updateComponents: { surfaceId: 's' } }), { version: '1.0', updateComponents: { surfaceId: 's' } });
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
