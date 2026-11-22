// Loads each site page in jsdom with its real scripts (and a fetch that reads files from
// the repository), then checks that it rendered and raised no errors.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const built = fs.existsSync(path.join(root, 'dist/bitwrench-a2ui.min.js'));

async function load(page, query = '') {
  const file = path.join(root, 'pages', page);
  const html = fs.readFileSync(file, 'utf8');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e.message));
  vc.on('error', e => errors.push(String(e)));
  const dom = new JSDOM(html.replace(/<script\b[\s\S]*?<\/script>/g, ''), {
    url: `https://example.test/pages/${page}${query}`, runScripts: 'outside-only', virtualConsole: vc, pretendToBeVisual: true,
  });
  const w = dom.window;
  Object.assign(w, { TextEncoder, TextDecoder, ReadableStream });
  w.fetch = async rel => {
    const target = path.normalize(path.join(path.dirname(file), String(rel)));
    if (!target.startsWith(root) || !fs.existsSync(target)) return { ok: false, statusText: 'not found', json: async () => ({}), text: async () => '' };
    const body = fs.readFileSync(target, 'utf8');
    return { ok: true, json: async () => JSON.parse(body), text: async () => body };
  };
  for (const m of html.matchAll(/<script(?:\s+src="([^"]+)")?\s*>([\s\S]*?)<\/script>/g)) {
    w.eval(m[1] ? fs.readFileSync(path.join(path.dirname(file), m[1]), 'utf8') : m[2]);
  }
  await new Promise(r => setTimeout(r, 120));
  return { w, errors };
}

describe('site pages', { skip: !built && 'run npm run build first' }, () => {
  it('index: hero, live demo and sections', async () => {
    const { w, errors } = await load('index.html');
    assert.match(w.document.querySelector('.site-hero h1').textContent, /A2UI renderer/);
    await new Promise(r => setTimeout(r, 200));
    assert.ok(w.document.querySelector('#demo-surface [data-a2ui-id="root"]'), 'demo surface rendered');
    assert.ok(w.document.querySelectorAll('.site-section').length >= 4);
    assert.deepEqual(errors, []);
    w.close();
  });

  it('playground: editor, preset render, upstream presets, step controls', async () => {
    const { w, errors } = await load('playground.html');
    assert.ok(w.document.querySelector('#pg-editor .bw_ce'), 'editor mounted');
    assert.ok(w.document.querySelector('#pg-surface [data-a2ui-id="root"]'), 'preset rendered');
    assert.ok(w.document.querySelectorAll('#pg-preset optgroup').length >= 2, 'upstream examples listed');
    const reset = [...w.document.querySelectorAll('.site-toolbar button')].find(b => b.textContent === 'Reset');
    reset.click();
    const stepBtn = [...w.document.querySelectorAll('.site-toolbar button')].find(b => b.textContent === 'Step');
    stepBtn.click();
    assert.match(w.document.getElementById('pg-pos').textContent, /^1 \//);
    assert.deepEqual(errors, []);
    w.close();
  });

  it('gallery: all 18 components rendered', async () => {
    const { w, errors } = await load('gallery.html');
    const types = new Set([...w.document.querySelectorAll('[data-a2ui-type]')].map(e => e.getAttribute('data-a2ui-type')));
    for (const t of ['Text', 'Image', 'Icon', 'Video', 'AudioPlayer', 'Divider', 'Row', 'Column', 'List', 'Card', 'Tabs', 'Modal', 'Button', 'TextField', 'CheckBox', 'ChoicePicker', 'Slider', 'DateTimeInput']) {
      assert.ok(types.has(t), `${t} missing`);
    }
    assert.deepEqual(errors, []);
    w.close();
  });

  it('examples and llm pages render their controls', async () => {
    for (const page of ['examples.html', 'llm.html']) {
      const { w, errors } = await load(page);
      assert.ok(w.document.querySelector('.site-header h1'), `${page} header`);
      assert.deepEqual(errors, [], page);
      w.close();
    }
  });

  it('llm page builds a system prompt from the catalog and needs a key', async () => {
    const { w } = await load('llm.html');
    const tabs = [...w.document.querySelectorAll('.site-tabs button')];
    tabs.find(b => b.textContent === 'System prompt').click();
    assert.match(w.document.querySelector('.site-tabs + [role="tabpanel"]').textContent, /createSurface/);
    w.document.getElementById('llm-prompt').value = 'a form';
    [...w.document.querySelectorAll('button')].find(b => b.textContent === 'Build it').click();
    await new Promise(r => setTimeout(r, 20));
    assert.match(w.document.getElementById('llm-status').textContent, /API key/);
    w.close();
  });

  it('docs: renders a Markdown document and rewrites links', async () => {
    const { w, errors } = await load('docs.html', '?doc=quick-start');
    await new Promise(r => setTimeout(r, 100));
    const body = w.document.getElementById('doc-body');
    assert.match(body.querySelector('h1').textContent, /Quick start/);
    assert.ok([...body.querySelectorAll('a')].some(a => a.getAttribute('href').startsWith('docs.html?doc=')), 'doc links rewritten');
    assert.deepEqual(errors, []);
    w.close();
  });

  it('every doc in the nav exists', () => {
    const html = fs.readFileSync(path.join(root, 'pages/docs.html'), 'utf8');
    const ids = [...html.matchAll(/\['([\w-]+)', '[^']+'\]/g)].map(m => m[1]);
    assert.ok(ids.length > 10);
    for (const id of ids) assert.ok(fs.existsSync(path.join(root, 'docs', `${id}.md`)), `docs/${id}.md missing`);
  });
});
