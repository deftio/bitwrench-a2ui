// Runs the upstream A2UI conformance suites against bitwrench-a2ui.
//   core/adapter_conformance.yaml   framework adapter behaviour (render_surface)
//   core/accessibility.yaml          accessibility mapping (accessibility_check)
//   adapter/markdown_subset.yaml     safe Markdown subset in Text (render_markdown)
// The suites are vendored, pinned copies in test/upstream/conformance (Apache-2.0).
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from 'yaml';

import { assertA11y, assertAxe, runStep, startSession, unsupportedReason, unusedUnsupported, writeManifest } from './harness.js';
import { freshMount } from '../helpers/dom.js';

const { markdownToTaco } = await import('../../src/index.js');
const { default: bw } = await import('bitwrench');

const load = f => parse(fs.readFileSync(new URL(`../upstream/conformance/${f}`, import.meta.url), 'utf8'));
const adapterCases = load('adapter_conformance.yaml');
const a11yCases = load('accessibility.yaml');
const mdCases = load('markdown_subset.yaml');

function record(suite, name, status, reason) {
  writeManifest({ harness: 'bitwrench', suite, case: name, status, ...(reason ? { reason } : {}) });
}

describe('conformance: core/adapter_conformance.yaml', () => {
  assert.ok(adapterCases.length > 0);
  for (const tc of adapterCases) {
    it(tc.name, async t => {
      const skip = unsupportedReason(tc.name, tc.steps);
      if (skip) { record('core/adapter_conformance.yaml', tc.name, 'skipped', skip); t.skip(skip); return; }
      assert.equal(tc.action, 'render_surface');
      try {
        const s = startSession(tc);
        for (const step of tc.steps) await runStep(s, step);
        s.renderer.destroy();
        record('core/adapter_conformance.yaml', tc.name, 'passed');
      } catch (e) {
        record('core/adapter_conformance.yaml', tc.name, 'failed', e.message);
        throw e;
      }
    });
  }
});

describe('conformance: core/accessibility.yaml', () => {
  assert.ok(a11yCases.length > 0);
  for (const tc of a11yCases) {
    it(tc.name, async t => {
      const steps = tc.steps ?? [{ messages: tc.messages ?? [], assertions: tc.assertions ?? {} }];
      const skip = unsupportedReason(tc.name, steps);
      if (skip) { record('core/accessibility.yaml', tc.name, 'skipped', skip); t.skip(skip); return; }
      try {
        const s = startSession(tc);
        for (const step of steps) {
          s.renderer.receive(step.messages ?? []);
          if (!s.surfaceId) s.surfaceId = s.renderer.surfaceIds()[0];
          for (const [id, exp] of Object.entries(step.assertions?.accessibilityTree ?? {})) assertA11y(s, id, exp);
          if (step.assertions?.axeCore) assertAxe(s, step.assertions.axeCore);
        }
        s.renderer.destroy();
        record('core/accessibility.yaml', tc.name, 'passed');
      } catch (e) {
        record('core/accessibility.yaml', tc.name, 'failed', e.message);
        throw e;
      }
    });
  }
});

const PRESENT = { emphasis: 'em', strong: 'strong', heading: 'h1,h2,h3,h4,h5,h6', list_item: 'li', code: 'code' };
const ABSENT = { html: 'span', image: 'img', link: 'a' };

describe('conformance: adapter/markdown_subset.yaml', () => {
  for (const tc of mdCases) {
    it(tc.name, () => {
      const mount = freshMount();
      const { content } = markdownToTaco(tc.markdown);
      bw.mount(mount, { t: 'div', a: { class: 'md-root' }, c: content });
      const rootEl = mount.querySelector('.md-root');
      const text = [...rootEl.querySelectorAll('*')].length
        ? textBlocks(rootEl) : rootEl.textContent;
      assert.equal(text.replace(/\s+/g, ' ').trim(), tc.expectVisibleText);
      for (const k of tc.expectPresent ?? []) assert.ok(rootEl.querySelector(PRESENT[k]), `expected ${k}`);
      for (const k of tc.expectAbsent ?? []) assert.equal(rootEl.querySelector(ABSENT[k]), null, `unexpected ${k}`);
      record('adapter/markdown_subset.yaml', tc.name, 'passed');
    });
  }
});

// Visible text with block elements separated by spaces (as a browser renders them).
function textBlocks(el) {
  const BLOCK = /^(P|H[1-6]|LI|UL|OL|PRE|BLOCKQUOTE|DIV)$/;
  let out = '';
  for (const n of el.childNodes) {
    if (n.nodeType === 3) out += n.nodeValue;
    else if (n.nodeType === 1) out += BLOCK.test(n.tagName) ? ` ${textBlocks(n)} ` : textBlocks(n);
  }
  return out;
}

after(() => {
  assert.deepEqual(unusedUnsupported(), [], 'UNSUPPORTED entries that matched no case');
});
