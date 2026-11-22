// Conformance harness for the upstream A2UI YAML suites (conformance/core/*.yaml),
// driving bitwrench-a2ui through jsdom. Modelled on the official Lit renderer harness
// (typescript/renderers/lit/src/tests/adapter_harness.ts) so results are comparable.
//
// Test-only code may reach into core internals (for example to invoke an action
// without user activation, or to count subscriptions), as the Lit harness does.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { window as w, freshMount } from '../helpers/dom.js';
import { RendererToAgentMessageSchema } from '@a2ui/web_core/v1_0';

const { createRenderer, createBasicCatalog, buildCatalog, makeFunction, component } = await import('../../src/index.js');

/** Cases or case/key pairs this renderer does not support, with the reason. Must all match. */
export const UNSUPPORTED = {};
const matched = new Set();

export function unsupportedReason(name, steps = []) {
  if (Object.hasOwn(UNSUPPORTED, name)) { matched.add(name); return UNSUPPORTED[name]; }
  for (const step of steps) {
    for (const key of [step.op, ...Object.keys(step), ...Object.keys(step.assertions ?? {})]) {
      const k = `${name}/${key}`;
      if (key && Object.hasOwn(UNSUPPORTED, k)) { matched.add(k); return UNSUPPORTED[k]; }
    }
  }
  return undefined;
}

export function unusedUnsupported() {
  return Object.keys(UNSUPPORTED).filter(k => !matched.has(k));
}

// ---- manifest ------------------------------------------------------------------

export function writeManifest(rec) {
  const dir = process.env.A2UI_CONFORMANCE_MANIFEST_DIR;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, `bitwrench-${process.pid}.jsonl`), `${JSON.stringify(rec)}\n`);
}

// ---- catalogs ------------------------------------------------------------------

const incrementCounter = makeFunction({
  name: 'incrementCounter',
  returnType: 'void',
  execute(args, context) {
    const target = args.path ?? args.targetPath ?? '/counter';
    const delta = Number(args.step ?? args.amount ?? 1);
    const current = Number(context.dataModel.get(target) ?? 0);
    context.dataModel.set(target, current + delta);
  },
});

const StatusBadge = component({
  render: p => ({ t: 'span', a: { class: 'a2ui-custom-badge' }, c: String(p.badgeText?.value ?? p.badgeText ?? '') }),
  update(el, p) { el.textContent = String(p.badgeText?.value ?? p.badgeText ?? ''); return true; },
});

function secondaryCatalog(spec) {
  const json = {
    catalogId: spec.catalogId,
    protocolVersion: spec.protocolVersion ?? '1.0',
    components: spec.components ?? {},
    functions: spec.functions ?? {},
  };
  const impls = {};
  for (const name of Object.keys(json.components)) impls[name] = StatusBadge;
  return buildCatalog(json, impls, []);
}

// ---- session -------------------------------------------------------------------

export function startSession(testCase = {}) {
  const mount = freshMount();
  const outbound = [];
  const actions = [];
  const errors = [];
  let lastCallId = '';
  const catalogs = [
    createBasicCatalog({ functions: [incrementCounter] }),
    ...(testCase.catalogs ?? []).map(secondaryCatalog),
  ];
  const validation = testCase.strictMode === true ? 'strict' : testCase.strictMode === false ? 'relaxed' : undefined;
  const renderer = createRenderer({
    mount,
    catalogs,
    validation,
    send(msg) {
      const m = structuredClone(msg);
      outbound.push(m);
      if (m.action) {
        const { name, surfaceId, sourceComponentId, context } = m.action;
        actions.push({ name, surfaceId, sourceComponentId, context });
      }
      if (m.callAgentFunction?.functionCallId) lastCallId = m.callAgentFunction.functionCallId;
    },
    onDiagnostic(d) {
      if (d.source === 'surface' && d.level === 'error') errors.push({ code: d.code, message: String(d.message ?? ''), surfaceId: d.surfaceId });
    },
  });
  return {
    renderer, mount, outbound, actions, errors,
    get lastCallId() { return lastCallId; },
    priorEls: new Map(), priorNodes: new Map(),
    surfaceId: null,
  };
}

function substitute(value, lastCallId) {
  if (Array.isArray(value)) return value.map(v => substitute(v, lastCallId));
  if (value && typeof value === 'object') {
    if (value.$ref === 'lastCallId' && Object.keys(value).length === 1) return lastCallId;
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substitute(v, lastCallId)]));
  }
  return value;
}

const root = s => s.renderer.debug.rootView(s.surfaceId ?? undefined);
const findView = (s, id) => s.renderer.debug.findView(id, s.surfaceId ?? undefined);

function snapshot(s) {
  s.priorEls = new Map();
  s.priorNodes = new Map();
  const r = root(s);
  if (!r) return;
  s.priorEls.set('root', r.el);
  r.children().forEach((c, i) => s.priorEls.set(`root/children/${i}`, c.el));
  const visit = v => { s.priorNodes.set(v.node.componentId, v.node); v.children().forEach(visit); };
  visit(r);
}

function identityEl(s, idPath) {
  const r = root(s);
  if (!r) return undefined;
  if (idPath === 'root') return r.el;
  const m = /^root\/children\/(\d+)$/.exec(idPath);
  if (m) return r.children()[Number(m[1])]?.el;
  return findView(s, idPath)?.el;
}

// ---- operations ----------------------------------------------------------------

function control(el, selector) {
  const c = el.matches(selector) ? el : el.querySelector(selector);
  assert.ok(c, `expected ${selector} inside component`);
  return c;
}

async function performOp(s, step) {
  switch (step.op) {
    case 'process_messages': {
      s.renderer.receive(substitute(step.messages ?? [], s.lastCallId));
      if (!s.surfaceId) s.surfaceId = s.renderer.surfaceIds()[0] ?? null;
      await new Promise(r => setTimeout(r, 5));   // let RPC promise chains settle
      return;
    }
    case 'user_input': {
      const v = findView(s, step.targetNode);
      assert.ok(v?.el, `no view for "${step.targetNode}"`);
      const el = v.el;
      const value = step.inputValue;
      switch (v.node.type) {
        case 'CheckBox': {
          const cb = control(el, 'input[type="checkbox"]');
          cb.checked = !!value;
          cb.dispatchEvent(new w.Event('change', { bubbles: true }));
          return;
        }
        case 'ChoicePicker': {
          const wanted = (Array.isArray(value) ? value : [value]).map(String);
          for (const opt of el.querySelectorAll('input.a2ui-option-input')) {
            const on = wanted.includes(opt.value);
            if (opt.type === 'radio' ? on : opt.checked !== on) {
              opt.checked = on;
              opt.dispatchEvent(new w.Event('change', { bubbles: true }));
            }
          }
          return;
        }
        case 'Tabs': {
          const btns = el.querySelectorAll('.a2ui-tab-button');
          const i = Number(value ?? 0);
          assert.ok(btns[i], `no tab ${i}`);
          btns[i].click();
          return;
        }
        case 'Slider': {
          const r = control(el, 'input[type="range"]');
          r.value = String(value ?? 0);
          r.dispatchEvent(new w.Event('input', { bubbles: true }));
          return;
        }
        case 'DateTimeInput': {
          const i = control(el, 'input');
          i.value = String(value ?? '');
          i.dispatchEvent(new w.Event('change', { bubbles: true }));
          return;
        }
        default: {
          const i = control(el, 'input, textarea');
          i.value = String(value ?? '');
          i.dispatchEvent(new w.Event('input', { bubbles: true }));
        }
      }
      return;
    }
    case 'user_gesture': {
      const v = findView(s, step.targetNode);
      assert.ok(v?.el, `no view for "${step.targetNode}"`);
      const target = v.el.matches('button') ? v.el : (v.el.querySelector('button') ?? v.el);
      const orig = w.open;
      w.open = () => null;
      try { target.click(); } finally { w.open = orig; }
      await new Promise(r => setTimeout(r, 0));
      return;
    }
    case 'programmatic_invoke': {
      const v = findView(s, step.targetNode);
      const raw = v?.node?.context?.componentModel?.properties?.action;
      assert.ok(raw && v.node.context, `no action on "${step.targetNode}"`);
      await Promise.resolve(v.node.context.dataContext.resolveAction(raw, { userActivation: !!step.userActivation })).catch(() => {});
      await new Promise(r => setTimeout(r, 0));
      return;
    }
    case 'unmount_surface': {
      s.renderer.debug.unmount(s.surfaceId ?? undefined);
      return;
    }
    default:
      assert.fail(`unsupported op ${step.op}`);
  }
}

// ---- assertions ----------------------------------------------------------------

const unwrap = v => (v && typeof v === 'object' && !Array.isArray(v) && 'value' in v && !('instanceId' in v) ? v.value : v);

function occupies(view) {
  const h = view.holder;
  if (!h || h.style.display === 'none') return false;
  return !!view.el;
}

function assertNode(view, expected, where) {
  assert.ok(view, `${where}: expected a view for "${expected.id}"`);
  const node = view.node;
  assert.equal(node.componentId, expected.id, `${where}: id`);
  if (expected.type !== undefined) assert.equal(node.type, expected.type, `${where}: type`);
  if (expected.state !== undefined) assert.equal(node.state, expected.state, `${where}: state`);
  if (expected.occupiesLayout !== undefined) assert.equal(occupies(view), expected.occupiesLayout, `${where}: occupiesLayout`);
  if (node.state === 'resolved') assert.ok(view.el, `${where}: resolved node has no DOM element`);
  const p = view.p ?? {};
  if (expected.text !== undefined) {
    assert.equal(unwrap(p.text), expected.text, `${where}: text prop`);
    assert.ok(view.el.textContent.includes(expected.text), `${where}: DOM text "${view.el.textContent}" lacks "${expected.text}"`);
  }
  if (expected.value !== undefined) {
    assert.deepEqual(unwrap(p.value), expected.value, `${where}: value prop`);
    assertDomValue(view, expected.value, where);
  }
  if (expected.url !== undefined) {
    assert.equal(unwrap(p.url), expected.url, `${where}: url prop`);
    const media = view.el.matches('img,video,audio') ? view.el : view.el.querySelector('img,video,audio');
    if (media) assert.equal(media.getAttribute('src'), expected.url, `${where}: media src`);
  }
  if (expected.name !== undefined) {
    assert.equal(unwrap(p.name), expected.name, `${where}: name`);
    assert.equal(view.el.getAttribute('data-icon'), expected.name, `${where}: rendered icon`);
  }
  if (expected.axis !== undefined) {
    assert.equal(unwrap(p.axis), expected.axis, `${where}: axis`);
    const vertical = view.el.classList.contains('a2ui-divider--vertical');
    assert.equal(vertical, expected.axis === 'vertical', `${where}: rendered axis`);
  }
  if (expected.badgeText !== undefined) {
    assert.equal(unwrap(p.badgeText), expected.badgeText, `${where}: badgeText`);
    assert.ok(view.el.textContent.includes(expected.badgeText), `${where}: badge DOM text`);
  }
  if (expected.isValid !== undefined) {
    assert.equal(p.isValid, expected.isValid, `${where}: isValid`);
    assert.equal(view.el.classList.contains('a2ui-invalid'), !expected.isValid, `${where}: invalid class`);
  }
  if (expected.validationErrors !== undefined) {
    assert.deepEqual(p.validationErrors ?? [], expected.validationErrors, `${where}: validationErrors`);
    for (const e of expected.validationErrors) assert.ok(view.el.textContent.includes(e), `${where}: error "${e}" not shown`);
  }
  if (expected.validationResults !== undefined) assert.deepEqual(p.validationResults, expected.validationResults, `${where}: validationResults`);
  if (expected.hints !== undefined) {
    for (const h of expected.hints) assert.ok(view.el.querySelector('.a2ui-hints')?.textContent.includes(h), `${where}: hint "${h}" not shown`);
  }
  if (expected.children !== undefined) {
    const kids = view.children();
    assert.equal(kids.length, expected.children.length, `${where}: child count of "${node.componentId}"`);
    expected.children.forEach((c, i) => assertNode(kids[i], c, `${where}/${i}`));
  }
}

function assertDomValue(view, expected, where) {
  const el = view.el;
  switch (view.node.type) {
    case 'CheckBox': assert.equal(el.querySelector('input').checked, expected, `${where}: checkbox DOM`); break;
    case 'ChoicePicker': assert.deepEqual([...el.querySelectorAll('input.a2ui-option-input')].filter(i => i.checked).map(i => i.value), expected, `${where}: choice DOM`); break;
    case 'Slider': assert.equal(Number(el.querySelector('input').value), expected, `${where}: slider DOM`); break;
    case 'TextField': assert.equal(el.querySelector('input,textarea').value, expected, `${where}: input DOM`); break;
    default: break;
  }
}

function matches(actual, expected, where) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected) && Object.keys(expected).length === 1 && expected.$match === 'any') {
    assert.ok(actual !== undefined && actual !== null, `${where}: expected any value`);
    return;
  }
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${where}: expected array`);
    assert.equal(actual.length, expected.length, `${where}: length`);
    expected.forEach((e, i) => matches(actual[i], e, `${where}[${i}]`));
    return;
  }
  if (expected && typeof expected === 'object') {
    assert.ok(actual && typeof actual === 'object', `${where}: expected object`);
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), `${where}: keys`);
    for (const k of Object.keys(expected)) matches(actual[k], expected[k], `${where}.${k}`);
    return;
  }
  assert.equal(actual, expected, `${where}`);
}

function ownAttr(el, attr, hostView) {
  if (el.getAttribute(attr)) return el.getAttribute(attr);
  for (const d of el.querySelectorAll(`[${attr}]`)) {
    const owner = d.closest('[data-a2ui-id]');
    if (owner === el && !d.matches('.a2ui-choice-filter, .a2ui-modal-close') && d.getAttribute(attr)) return d.getAttribute(attr);
  }
  return undefined;
}

function accessibleLabel(el) {
  const explicit = ownAttr(el, 'aria-label');
  if (explicit) return explicit;
  const btn = el.matches('button') ? el : el.querySelector('button');
  if (btn?.textContent) return btn.textContent.trim();
  const label = el.querySelector('label');
  if (label?.textContent) return label.textContent.trim();
  return el.textContent?.trim() || undefined;
}

function role(el) {
  const explicit = el.getAttribute('role');
  if (explicit) return explicit;
  if (el.matches('button') || el.querySelector('button')) return 'button';
  if (el.querySelector('input[type="checkbox"]')) return 'checkbox';
  if (el.querySelector('input[type="radio"]')) return 'radiogroup';
  if (el.querySelector('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea')) return 'textbox';
  return undefined;
}

export function assertA11y(s, compId, expected) {
  const v = findView(s, compId);
  assert.ok(v?.el, `no element for "${compId}"`);
  const el = v.el;
  if (expected.label !== undefined) assert.equal(accessibleLabel(el), expected.label, `${compId}: label`);
  if (expected.description !== undefined) assert.equal(ownAttr(el, 'aria-description'), expected.description, `${compId}: description`);
  if (expected.live !== undefined) assert.equal(el.getAttribute('aria-live'), expected.live, `${compId}: live`);
  if (expected.hidden !== undefined) assert.equal(el.getAttribute('aria-hidden'), expected.hidden ? 'true' : null, `${compId}: hidden`);
  if (expected.role !== undefined) assert.equal(role(el), expected.role, `${compId}: role`);
  if (expected.checked !== undefined) assert.equal(el.querySelector('input[type="checkbox"]')?.checked, expected.checked, `${compId}: checked`);
}

export function assertAxe(s, rules) {
  const host = s.mount;
  if (rules.includes('button-name')) {
    for (const b of host.querySelectorAll('button')) {
      assert.ok(b.getAttribute('aria-label') || b.textContent.trim(), 'button without accessible name');
    }
  }
  if (rules.includes('aria-valid-attr-value')) {
    for (const n of host.querySelectorAll('[aria-live]')) assert.ok(['off', 'polite', 'assertive'].includes(n.getAttribute('aria-live')));
    for (const n of host.querySelectorAll('[aria-hidden]')) assert.ok(['true', 'false'].includes(n.getAttribute('aria-hidden')));
  }
  if (rules.includes('label')) {
    for (const i of host.querySelectorAll('input:not([type="hidden"]), textarea, select')) {
      const id = i.getAttribute('id');
      const labelled = i.getAttribute('aria-label') || i.getAttribute('aria-labelledby') || (id && host.querySelector(`label[for="${id}"]`)) || i.closest('label');
      assert.ok(labelled, `form control without label: ${i.outerHTML.slice(0, 80)}`);
    }
  }
}

function countSubscriptions(surface) {
  const created = surface.componentsModel.onCreated.listeners?.size ?? 0;
  const deleted = surface.componentsModel.onDeleted.listeners?.size ?? 0;
  const data = surface.dataModel.subscriptions?.size ?? 0;
  return created + deleted + data;
}

export async function runStep(s, step) {
  s.actions.length = 0;
  s.errors.length = 0;
  s.outbound.length = 0;
  snapshot(s);
  const surfaceBefore = s.surfaceId ? s.renderer.surface(s.surfaceId) : null;
  await performOp(s, step);

  if (step.expectViewTree) assertNode(root(s), step.expectViewTree, 'viewTree');
  if (step.expectDataModel) assert.deepEqual(s.renderer.surface(s.surfaceId).dataModel.get('/'), step.expectDataModel, 'dataModel');
  for (const p of step.expectSameViewIdentity ?? []) {
    const before = s.priorEls.get(p);
    assert.ok(before && identityEl(s, p), `identity "${p}" missing`);
    assert.equal(identityEl(s, p), before, `identity "${p}" changed`);
  }
  for (const p of step.expectNewViewIdentity ?? []) {
    const before = s.priorEls.get(p);
    assert.ok(before && identityEl(s, p), `identity "${p}" missing`);
    assert.notEqual(identityEl(s, p), before, `identity "${p}" not replaced`);
  }
  for (const id of step.expectDisposedNodes ?? []) {
    const n = s.priorNodes.get(id);
    assert.ok(n, `no prior node ${id}`);
    assert.equal(n.disposed, true, `node ${id} not disposed`);
    assert.equal(s.mount.querySelector(`[data-a2ui-id="${id}"]`), null, `node ${id} still in DOM`);
  }
  if (step.expectSurfaceRemoved) {
    assert.equal(s.renderer.surface(s.surfaceId), undefined, 'surface still in core');
    assert.equal(s.mount.querySelector('.a2ui-surface'), null, 'surface host still in DOM');
  }
  if (step.expectActions !== undefined) assert.deepEqual(s.actions, step.expectActions, 'actions');
  if (step.expectErrors !== undefined) {
    assert.equal(s.errors.length, step.expectErrors.length, `errors: ${JSON.stringify(s.errors)}`);
    step.expectErrors.forEach((e, i) => {
      if (e.code !== undefined) assert.equal(s.errors[i].code, e.code);
      if (e.surfaceId !== undefined) assert.equal(s.errors[i].surfaceId, e.surfaceId);
      if (e.message !== undefined) assert.ok(s.errors[i].message.includes(e.message), `error message "${s.errors[i].message}" lacks "${e.message}"`);
    });
  }
  for (const [i, env] of s.outbound.entries()) {
    const r = RendererToAgentMessageSchema.safeParse(env);
    assert.ok(r.success, `outbound[${i}] invalid: ${JSON.stringify(env)} ${r.success ? '' : JSON.stringify(r.error.issues)}`);
  }
  if (step.expectOutbound !== undefined) matches(s.outbound, step.expectOutbound, 'outbound');
  for (const [id, exp] of Object.entries(step.expectAccessibilityTree ?? {})) assertA11y(s, id, exp);
  if (step.expectThemeAbsent) {
    const surface = s.renderer.surface(s.surfaceId);
    assert.deepEqual(surface.theme ?? {}, {});
    for (const el of s.mount.querySelectorAll('*')) {
      const style = (el.getAttribute('style') ?? '').toLowerCase();
      assert.ok(!style.includes('#ff00aa') && !style.includes('255, 0, 170'), 'theme color leaked into DOM');
    }
  }
  if (step.expectActiveSubscriptions !== undefined) {
    const surface = surfaceBefore ?? s.renderer.surface(s.surfaceId);
    assert.equal(countSubscriptions(surface), step.expectActiveSubscriptions, 'active subscriptions');
  }
}

export { w as window };
