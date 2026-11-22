// Phase 0 spike runner. Answers, with code:
//   Q1  Does a tree-shaken bundle of the names we need exclude Lit?
//   Q2  Does web_core import and process v1.0 messages in Node with no DOM?
//   Q4  Does the bundle contain eval / new Function (strict CSP risk)?
// Q3 (Form 4 + bitwrench focus behaviour) needs jsdom and runs separately.
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = { q1: {}, q2: {}, q4: {} };

// ---- Q1 + Q4: bundle and inspect -------------------------------------------
const result = await build({
  entryPoints: [path.join(here, 'entry.js')],
  bundle: true, minify: true, format: 'esm', platform: 'browser',
  write: false, metafile: true, logLevel: 'silent',
});
// Judge by what lands in the output, not by what the bundler visited: esbuild visits
// the whole re-export graph but drops unused side-effect-free modules.
const pkgOf = p => { const m = p.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/); return m ? m[1] : '(local)'; };
const emitted = Object.entries(Object.values(result.metafile.outputs)[0].inputs).filter(([, v]) => v.bytesInOutput > 0);
const code = result.outputFiles[0].text;
const perPkg = {};
for (const [p, v] of emitted) perPkg[pkgOf(p)] = (perPkg[pkgOf(p)] || 0) + v.bytesInOutput;
out.q1.bytesInOutputByPackage = perPkg;
out.q1.litIncluded = Object.keys(perPkg).some(p => p === 'lit' || p.startsWith('@lit/') || p.startsWith('lit-'));
out.q1.universalLayerModules = emitted.map(([p]) => p).filter(p => p.includes('web_core/src/universal')).map(p => p.split('web_core/src/')[1]);
out.q1.customElementsDefine = code.includes('customElements.define');
out.q1.minBytes = code.length;
out.q1.gzipBytes = gzipSync(code).length;
out.q4.newFunction = (code.match(/new Function\s*\(/g) || []).length;
out.q4.evalCall = (code.match(/[^.\w]eval\s*\(/g) || []).length;
out.q4.FunctionCtorCall = (code.match(/[^.\w]Function\s*\(\s*["'`]/g) || []).length;

// ---- Q2: headless processing in Node ---------------------------------------
out.q2.hasDOM = typeof globalThis.document !== 'undefined' || typeof globalThis.HTMLElement !== 'undefined';
try {
  const m = await import('./entry.js');
  const catalog = m.makeBasicCatalog();
  const actions = [];
  const processor = new m.MessageProcessor([catalog], a => actions.push(a));
  const errs = processor.processMessagesWithErrors([
    { version: '1.0', createSurface: { surfaceId: 's1', catalogId: m.BASIC_CATALOG_ID,
      dataModel: { user: { name: 'Ada' } },
      components: [
        { id: 'root', component: 'Column', children: ['greet', 'name', 'go'] },
        { id: 'greet', component: 'Text', text: { '@call': 'formatString', args: { value: 'Hello, ${/user/name}!' } } },
        { id: 'name', component: 'TextField', label: 'Name', value: { '@path': '/user/name' } },
        { id: 'goLabel', component: 'Text', text: 'Submit' },
        { id: 'go', component: 'Button', child: 'goLabel',
          action: { event: { name: 'submit', context: { name: { '@path': '/user/name' } } } } },
      ] } },
  ]);
  const surface = processor.getSurface('s1');
  const resolver = new m.NodeResolver(surface);
  const root = m.getValue(resolver.rootNode);
  const summarize = (node, depth = 0) => {
    if (!node || depth > 4) return null;
    const props = m.getValue(node.props) || {};
    const kids = Object.values(props).flatMap(v => Array.isArray(v) ? v : [v])
      .filter(v => v && typeof v === 'object' && 'instanceId' in v);
    const simple = {};
    for (const [k, v] of Object.entries(props)) {
      if (v && typeof v === 'object' && 'instanceId' in v) continue;
      if (Array.isArray(v) && v.some(x => x && typeof x === 'object' && 'instanceId' in x)) continue;
      simple[k] = typeof v === 'function' ? '[action]' : (v && typeof v === 'object' && 'value' in v ? { value: v.value, writable: typeof v.set === 'function' } : v);
    }
    return { id: node.componentId, type: node.type, state: node.state, props: simple, children: kids.map(k => summarize(k, depth + 1)) };
  };
  out.q2.errors = errs?.errors ?? errs;
  out.q2.tree = summarize(root);

  // two-way binding: write through the TextField's binding, check the Text re-resolves
  const col = m.getValue(root.props);
  const kids = col.children;
  const field = kids.find(k => k.type === 'TextField');
  const text = kids.find(k => k.type === 'Text');
  m.getValue(field.props).value.set('Grace');
  out.q2.afterSet = { text: m.getValue(text.props).text?.value ?? m.getValue(text.props).text,
                      model: surface.dataModel?.get ? surface.dataModel.get('/user/name') : '(no get)' };
  // action: invoke the button action, check the outbound message
  const btn = kids.find(k => k.type === 'Button');
  await m.getValue(btn.props).action?.();
  out.q2.actions = actions;
  resolver.dispose();
  out.q2.ok = true;
} catch (e) {
  out.q2.ok = false;
  out.q2.error = String(e && e.stack || e).split('\n').slice(0, 6).join('\n');
}

console.log(JSON.stringify(out, null, 2));
