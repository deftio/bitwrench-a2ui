// The site's demo fixtures and gallery entries must render with no real errors, and
// scripted agent replies must apply cleanly. Keeps the published demos honest.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { window as w, freshMount, tick } from '../helpers/dom.js';

const { createRenderer, renderToHTML } = await import('../../src/index.js');

w.eval(fs.readFileSync(new URL('../../pages/fixtures.js', import.meta.url), 'utf8'));
w.eval(fs.readFileSync(new URL('../../pages/gallery.js', import.meta.url), 'utf8'));
const { FIXTURES } = w.A2UI_FIXTURES;
const GALLERY = w.A2UI_GALLERY;

const realErrors = diags => diags.filter(d => d.level === 'error' && !(d.source === 'surface' && d.code === 'EXPRESSION_ERROR'));

describe('site fixtures', () => {
  for (const f of FIXTURES) {
    it(`${f.id}: renders, and its scripted replies apply`, async () => {
      const diags = [];
      const sent = [];
      const r = createRenderer({ mount: freshMount(), validation: 'relaxed', onDiagnostic: d => diags.push(d), send: m => sent.push(m) });
      const messages = f.stream ? f.stream.flatMap(s => s.messages) : f.messages;
      for (const m of messages) r.receive(JSON.parse(JSON.stringify(m)));
      assert.deepEqual(realErrors(diags), [], `errors in ${f.id}`);
      assert.ok(r.host().querySelector('[data-a2ui-id="root"]'), 'root rendered');
      const btn = r.host().querySelector('button.a2ui-button:not([disabled])');
      if (btn && f.respond) {
        btn.click();
        await tick();
        const action = sent.find(m => m.action);
        assert.ok(action, 'button sent an action');
        for (const reply of f.respond(action.action)) r.receive(JSON.parse(JSON.stringify(reply)));
        assert.deepEqual(realErrors(diags), [], `errors after reply in ${f.id}`);
      }
      assert.deepEqual(renderToHTML(JSON.parse(JSON.stringify(messages))).errors.filter(e => e.error.code !== 'EXPRESSION_ERROR'), []);
      r.destroy();
    });
  }

  it('booking: a valid form books, and the reply shows the confirmation', async () => {
    const f = FIXTURES.find(x => x.id === 'booking');
    const sent = [];
    const r = createRenderer({ mount: freshMount(), send: m => sent.push(m) });
    r.receive(JSON.parse(JSON.stringify(f.messages)));
    const book = r.debug.findView('book').el;
    assert.equal(book.disabled, true, 'disabled until valid');
    const set = (id, v) => { const i = r.debug.findView(id).el.querySelector('input,textarea'); if (typeof v === 'boolean') { i.checked = v; i.dispatchEvent(new w.Event('change', { bubbles: true })); } else { i.value = v; i.dispatchEvent(new w.Event('input', { bubbles: true })); } };
    set('name', 'Grace');
    set('email', 'grace@example.com');
    set('terms', true);
    assert.equal(book.disabled, false);
    book.click();
    await tick();
    const action = sent.find(m => m.action).action;
    assert.equal(action.name, 'book');
    assert.equal(action.context.booking.name, 'Grace');
    for (const reply of f.respond(action)) r.receive(JSON.parse(JSON.stringify(reply)));
    assert.match(r.host().textContent, /You are booked, Grace!/);
    assert.match(r.host().textContent, /Table for 2 on/);
  });
});

describe('gallery entries', () => {
  for (const e of GALLERY) {
    it(`${e.name}`, () => {
      const diags = [];
      const r = createRenderer({ mount: freshMount(), onDiagnostic: d => diags.push(d) });
      r.receive({ version: '1.0', createSurface: { surfaceId: 'g', catalogId: r.catalogId, components: JSON.parse(JSON.stringify(e.components)), ...(e.data ? { dataModel: JSON.parse(JSON.stringify(e.data)) } : {}) } });
      assert.deepEqual(diags.filter(d => d.level === 'error'), [], `errors in ${e.name}`);
      assert.ok(r.host().querySelector(`[data-a2ui-type="${e.name}"]`), `${e.name} rendered`);
      r.destroy();
    });
  }
  it('covers all 18 basic components', () => {
    assert.equal(new Set(GALLERY.map(g => g.name)).size, 18);
  });
  it('plays media that ships with the site, not placeholder URLs', () => {
    const urls = GALLERY.flatMap(g => g.components).filter(c => c.component === 'Video' || c.component === 'AudioPlayer').map(c => c.url);
    assert.equal(urls.length, 2);
    for (const url of urls) {
      assert.ok(!/^[a-z]+:/i.test(url), `${url} is a site file`);
      assert.ok(fs.statSync(new URL(`../../pages/${url}`, import.meta.url)).size > 1000, `pages/${url} exists`);
    }
  });
});
