// Loads the built browser files exactly as a page would (<script> tags, no bundler) and
// renders a surface. Run `npm run build` first; CI builds before testing.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const dist = new URL('../../dist/', import.meta.url);
const bwFile = new URL('../../node_modules/bitwrench/dist/bitwrench.umd.min.js', import.meta.url);
const has = f => fs.existsSync(new URL(f, dist));

function page(scripts) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM('<!doctype html><body><div id="app"></div></body>', { runScripts: 'outside-only', virtualConsole: vc, pretendToBeVisual: true });
  for (const s of scripts) dom.window.eval(fs.readFileSync(s, 'utf8'));
  return { w: dom.window, errors };
}

const MESSAGES = [{ version: '1.0', createSurface: { surfaceId: 'demo', catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
  dataModel: { name: 'Ada' },
  components: [{ id: 'root', component: 'Column', children: ['t', 'b'] },
    { id: 't', component: 'Text', text: { '@call': 'formatString', args: { value: 'Hello ${/name}' } } },
    { id: 'b', component: 'Button', child: 'bl', action: { event: { name: 'hi', context: { n: { '@path': '/name' } } } } }, { id: 'bl', component: 'Text', text: 'Say hi' }] } }];

describe('dist builds', { skip: !has('bitwrench-a2ui.min.js') && 'run npm run build first' }, () => {
  for (const [label, files] of [
    ['bitwrench UMD + bitwrench-a2ui.min.js', [bwFile, new URL('bitwrench-a2ui.min.js', dist)]],
    ['bitwrench-a2ui.bundle.min.js (single file)', [new URL('bitwrench-a2ui.bundle.min.js', dist)]],
  ]) {
    it(`${label}: renders and sends actions from a plain page`, async () => {
      const { w, errors } = page(files);
      assert.equal(typeof w.bwA2UI?.createRenderer, 'function');
      const sent = [];
      w.__sent = sent;
      w.eval(`
        const r = bwA2UI.createRenderer({ mount: '#app', send: m => window.__sent.push(m) });
        r.receive(${JSON.stringify(MESSAGES)});
        document.querySelector('button').click();
      `);
      assert.equal(w.document.querySelector('[data-a2ui-id="t"]').textContent, 'Hello Ada');
      await new Promise(r => setTimeout(r, 0));   // web_core resolves an action's context asynchronously
      assert.equal(sent[0].action.context.n, 'Ada');
      assert.deepEqual(errors, []);
    });
  }

  it('the script build without bitwrench explains what to load', () => {
    assert.throws(() => page([new URL('bitwrench-a2ui.min.js', dist)]), /load bitwrench \(bitwrench\.umd\.min\.js\) before bitwrench-a2ui/);
  });

  it('the MCP App template builds a single self-contained file that renders and bridges messages', async () => {
    const { execFileSync } = await import('node:child_process');
    const html = execFileSync(process.execPath, ['templates/mcp-app/build.js', 'test/upstream/examples/login-form.json', '--title', 'Login <test>', '--host-origin', 'https://host.example'],
      { cwd: new URL('../../', import.meta.url), encoding: 'utf8', maxBuffer: 1 << 26 });
    assert.ok(html.includes('<title>Login &lt;test&gt;</title>'));
    const errors = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', e => errors.push(e.message));
    const parentPosts = [];
    const dom = new JSDOM(html, { runScripts: 'dangerously', virtualConsole: vc, pretendToBeVisual: true,
      beforeParse(win) { Object.defineProperty(win, 'parent', { value: { postMessage: (m, origin) => parentPosts.push({ m, origin }) } }); } });
    const w = dom.window;
    await new Promise(r => setTimeout(r, 50));
    assert.equal(w.document.querySelectorAll('script[src]').length, 0, 'no external scripts');
    assert.ok(w.document.querySelector('[data-a2ui-id="root"]'), 'initial messages rendered');
    assert.ok(parentPosts.some(p => p.m.a2uiReady && p.m.capabilities), 'ready message posted');
    assert.ok(parentPosts.every(p => p.origin === 'https://host.example'), 'posts only to the host origin');
    const surfaceId = JSON.parse(fs.readFileSync(new URL('../upstream/examples/login-form.json', import.meta.url), 'utf8'))
      .messages.map(m => m.createSurface?.surfaceId).find(Boolean);
    const hostMessage = (source, origin = 'https://host.example') => {
      const ev = new w.MessageEvent('message', { origin, data: { a2ui: { version: '1.0', deleteSurface: { surfaceId } } } });
      Object.defineProperty(ev, 'source', { value: source });
      w.dispatchEvent(ev);
    };
    hostMessage(null);                                   // not from the parent: ignored
    hostMessage(w.parent, 'https://evil.example');       // the parent, but at another origin: ignored
    assert.ok(w.document.querySelector('[data-a2ui-id="root"]'), 'foreign message ignored');
    hostMessage(w.parent);                               // from the host frame: applied
    await new Promise(r => setTimeout(r, 20));
    assert.equal(w.document.querySelector('[data-a2ui-id="root"]'), null, 'host message applied');
    assert.deepEqual(errors, []);
    w.close();
  });

  it('builds.json records pins, integrity and the Lit check', () => {
    const report = JSON.parse(fs.readFileSync(new URL('builds.json', dist), 'utf8'));
    const deps = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).dependencies;
    assert.equal(report.pins.bitwrench, deps.bitwrench);
    assert.equal(report.pins['@a2ui/web_core'], deps['@a2ui/web_core']);
    for (const f of ['bitwrench-a2ui.min.js', 'bitwrench-a2ui.esm.min.js', 'bitwrench-a2ui.bundle.min.js']) {
      assert.match(report.files[f].integrity, /^sha384-/);
    }
    for (const c of Object.values(report.checks)) assert.equal(c.litModules, 0);
    assert.ok(fs.readFileSync(new URL('THIRD_PARTY_LICENSES', dist), 'utf8').includes('@a2ui/web_core'));
  });
});
