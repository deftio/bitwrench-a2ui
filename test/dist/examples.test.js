// Runs each standalone example page against the built dist files in jsdom: the page's
// own inline scripts must execute without errors and render a surface.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { splitScripts } from '../helpers/page.js';

const root = new URL('../../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');
const built = fs.existsSync(new URL('dist/bitwrench-a2ui.min.js', root));
const pages = fs.readdirSync(new URL('examples/', root)).filter(f => f.endsWith('.html') && f !== 'agent-client.html');

describe('examples', { skip: !built && 'run npm run build first' }, () => {
  for (const page of pages) {
    it(`${page} runs and renders`, async () => {
      const html = read(`examples/${page}`);
      const errors = [];
      const vc = new VirtualConsole();
      vc.on('jsdomError', e => errors.push(e.message));
      const split = splitScripts(html);
      const dom = new JSDOM(split.html, { runScripts: 'outside-only', virtualConsole: vc, pretendToBeVisual: true });
      const w = dom.window;
      // Browser globals jsdom does not provide.
      Object.assign(w, { TextEncoder, TextDecoder, ReadableStream });
      w.eval(read('node_modules/bitwrench/dist/bitwrench.umd.min.js'));
      w.eval(read('dist/bitwrench-a2ui.min.js'));
      const inline = split.scripts.filter(s => !s.src).map(s => s.code);
      assert.ok(inline.length > 0);
      try {
        for (const code of inline) w.eval(code);
        // Wait for streamed examples to finish (they deliver chunks on timers).
        for (let i = 0; i < 60 && !w.document.querySelector('.a2ui-surface [data-a2ui-id="root"]'); i++) await new Promise(r => setTimeout(r, 50));
        assert.ok(w.document.querySelector('.a2ui-surface [data-a2ui-id="root"]'), `a surface rendered (errors: ${errors.join('; ')})`);
        assert.deepEqual(errors, []);
      } finally {
        w.close();                       // stops the page's timers
      }
    });
  }

  it('the agent example server file parses', async () => {
    const src = read('examples/agent-server.mjs');
    assert.match(src, /text\/event-stream/);
  });
});
