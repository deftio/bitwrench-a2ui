// The 18 A2UI v1.0 basic catalog components, implemented with bitwrench.
//
// Each component builds TACO from the core's resolved props, using BCCL factories
// where their markup fits (Card, Button, form controls, Range) and plain TACO with
// BCCL class names elsewhere, so everything picks up the bitwrench theme. Agent
// strings only ever land in text content or allowlisted attributes; URLs go through
// the media URL policy; no raw HTML is ever produced.
import { isNode, isWritable, str, val } from '../../core/interface.js';
import { markdownToTaco } from '../../render/markdown.js';
import { safeMediaUrl, safeSvgPath } from '../../render/safety.js';
import { a11yOf } from '../../render/view.js';
import { component } from '../define.js';
import { ICONS, ICON_VIEWBOX } from './icons.js';

// ---- shared helpers --------------------------------------------------------------

const cls = (...parts) => parts.filter(Boolean).join(' ');
const pick = (v, allowed, dflt) => (allowed.includes(v) ? v : dflt);

/** Error messages and non-blocking hints from the core's normalized check results. */
function feedbackOf(p) {
  const errors = Array.isArray(p.validationErrors) ? p.validationErrors.map(String) : [];
  const hints = Array.isArray(p.validationResults)
    ? p.validationResults
      .filter(r => r && r.valid === false && (r.severity === 'warning' || r.severity === 'info') && r.message)
      .map(r => ({ text: String(r.message), severity: r.severity }))
    : [];
  return { invalid: p.isValid === false, errors, hints };
}

/** Root class and control attributes reflecting validity on first render. */
function validity(p, ctx) {
  const invalid = p.isValid === false;
  return {
    rootClass: invalid ? 'a2ui-invalid' : '',
    control: invalid ? { class: 'bw_is_invalid', 'aria-invalid': 'true', 'aria-errormessage': ctx.id('err') } : {},
  };
}

function feedbackTaco(p, ctx) {
  const f = feedbackOf(p);
  return [
    { t: 'div', a: { class: 'bw_invalid_feedback a2ui-errors', id: ctx.id('err'), role: 'alert', style: f.errors.length ? 'display:block' : 'display:none' },
      c: f.errors.map(e => ({ t: 'div', c: e })) },
    { t: 'div', a: { class: 'a2ui-hints', style: f.hints.length ? '' : 'display:none' },
      c: f.hints.map(h => ({ t: 'div', a: { class: `a2ui-hint a2ui-hint--${h.severity}` }, c: h.text })) },
  ];
}

function updateFeedback(el, p, control) {
  const f = feedbackOf(p);
  const errEl = el.querySelector('.a2ui-errors');
  const hintEl = el.querySelector('.a2ui-hints');
  if (errEl) {
    errEl.replaceChildren(...f.errors.map(e => { const d = el.ownerDocument.createElement('div'); d.textContent = e; return d; }));
    errEl.style.display = f.errors.length ? 'block' : 'none';
  }
  if (hintEl) {
    hintEl.replaceChildren(...f.hints.map(h => {
      const d = el.ownerDocument.createElement('div');
      d.className = `a2ui-hint a2ui-hint--${h.severity}`;
      d.textContent = h.text;
      return d;
    }));
    hintEl.style.display = f.hints.length ? '' : 'none';
  }
  el.classList.toggle('a2ui-invalid', f.invalid);
  if (control) {
    control.classList.toggle('bw_is_invalid', f.invalid);
    if (f.invalid) {
      control.setAttribute('aria-invalid', 'true');
      if (errEl?.id) control.setAttribute('aria-errormessage', errEl.id);
    } else {
      control.removeAttribute('aria-invalid');
      control.removeAttribute('aria-errormessage');
    }
  }
}

/** Set a live form property only when it differs (never fights the user's typing). */
function setProp(el, key, value) {
  if (el && el[key] !== value) el[key] = value;
}

function setText(el, text) {
  if (el && el.textContent !== text) el.textContent = text;
}

// ---- display -----------------------------------------------------------------------

export const Text = component({
  render(p) {
    const variant = pick(val(p.variant), ['caption', 'body'], 'body');
    const { content, block } = markdownToTaco(str(p.text));
    return { t: block ? 'div' : 'span', a: { class: cls('a2ui-text', `a2ui-text--${variant}`, block && 'a2ui-text--block') }, c: content };
  },
  update(el, p, ctx, prev) {
    if (str(prev.text) === str(p.text) && val(prev.variant) === val(p.variant)) return true;
    const { content, block } = markdownToTaco(str(p.text));
    if (block !== el.classList.contains('a2ui-text--block')) return false;
    const variant = pick(val(p.variant), ['caption', 'body'], 'body');
    el.className = cls('a2ui-text', `a2ui-text--${variant}`, block && 'a2ui-text--block');
    if (content.length === 1 && typeof content[0] === 'string') ctx.bw.patch(el, content[0]);
    else ctx.bw.patch(el, content);
    return true;
  },
});

const FITS = { contain: 'contain', cover: 'cover', fill: 'fill', none: 'none', scaleDown: 'scale-down' };
const IMAGE_VARIANTS = ['icon', 'avatar', 'smallFeature', 'mediumFeature', 'largeFeature', 'header'];

function imageAttrs(p) {
  const url = safeMediaUrl(str(p.url));
  const variant = pick(val(p.variant), IMAGE_VARIANTS, 'mediumFeature');
  return {
    src: url || null,
    alt: str(p.description),
    class: cls('a2ui-image', `a2ui-image--${variant}`, !url && 'a2ui-image--blocked'),
    style: `object-fit:${FITS[val(p.fit)] ?? 'fill'}`,
    loading: 'lazy',
  };
}

export const Image = component({
  render: p => ({ t: 'img', a: imageAttrs(p) }),
  update(el, p, ctx) { ctx.bw.patch(el, imageAttrs(p)); return true; },
});

function iconTaco(p, ctx) {
  const raw = p.name;
  // web_core 0.16 resolves `name` (a union that includes DataBinding) to {value, path?}:
  // the svgPath form arrives as {value: {svgPath}}.
  const shape = raw?.value && typeof raw.value === 'object' ? raw.value : raw;
  let d = '';
  let name = '';
  if (shape && typeof shape === 'object' && !Array.isArray(shape) && 'svgPath' in shape) {
    d = safeSvgPath(str(ctx.read(shape.svgPath)));
  } else {
    name = str(ctx.read(raw));
    d = Object.hasOwn(ICONS, name) ? ICONS[name] : '';
  }
  const labelled = !!a11yOf(p, ctx.read)?.label;
  return {
    t: 'svg',
    a: {
      class: 'a2ui-icon', viewBox: ICON_VIEWBOX, width: '24', height: '24', fill: 'currentColor',
      focusable: 'false', 'data-icon': name || null,
      ...(labelled ? { role: 'img' } : { 'aria-hidden': 'true', 'data-a2ui-own-a11y': 'aria-hidden' }),
    },
    c: d ? { t: 'path', a: { d } } : null,
  };
}

export const Icon = component({ render: iconTaco });

export const Video = component({
  render: p => ({ t: 'video', a: videoAttrs(p) }),
  update(el, p, ctx) { ctx.bw.patch(el, videoAttrs(p)); return true; },
});
function videoAttrs(p) {
  const src = safeMediaUrl(str(p.url));
  return { src: src || null, poster: safeMediaUrl(str(p.posterUrl), { allowData: true }) || null, controls: true, preload: 'metadata', playsinline: true, class: 'a2ui-video' };
}

export const AudioPlayer = component({
  render(p) {
    const desc = str(p.description);
    return {
      t: 'figure', a: { class: 'a2ui-audio' },
      c: [
        { t: 'audio', a: { src: safeMediaUrl(str(p.url)) || null, controls: true, preload: 'metadata', class: 'a2ui-audio-el' } },
        { t: 'figcaption', a: { class: 'a2ui-audio-caption', style: desc ? '' : 'display:none' }, c: desc },
      ],
    };
  },
  update(el, p, ctx) {
    ctx.bw.patch(el.querySelector('audio'), { src: safeMediaUrl(str(p.url)) || null });
    const cap = el.querySelector('figcaption');
    const desc = str(p.description);
    setText(cap, desc);
    cap.style.display = desc ? '' : 'none';
    return true;
  },
});

export const Divider = component({
  render(p) {
    const vertical = val(p.axis) === 'vertical';
    return vertical
      ? { t: 'div', a: { class: 'a2ui-divider a2ui-divider--vertical', role: 'separator', 'aria-orientation': 'vertical' } }
      : { t: 'hr', a: { class: 'a2ui-divider a2ui-divider--horizontal' } };
  },
  update: (el, p, ctx, prev) => val(prev.axis) === val(p.axis),
});

// ---- layout ------------------------------------------------------------------------

const JUSTIFY = ['start', 'center', 'end', 'spaceBetween', 'spaceAround', 'spaceEvenly', 'stretch'];
const ALIGN = ['start', 'center', 'end', 'stretch'];

function flexClass(kind, p) {
  return cls(`a2ui-${kind}`, `a2ui-justify-${pick(val(p.justify), JUSTIFY, 'start')}`, `a2ui-align-${pick(val(p.align), ALIGN, 'stretch')}`);
}

function flexContainer(kind) {
  return component({
    render: (p, ctx) => ctx.slot('children', { tag: 'div', attrs: { class: flexClass(kind, p) }, item: 'box' }),
    update(el, p) { el.className = flexClass(kind, p); return true; },
  });
}

export const Row = flexContainer('row');
export const Column = flexContainer('column');

function listClass(p) {
  return cls('a2ui-list', `a2ui-list--${pick(val(p.direction), ['vertical', 'horizontal'], 'vertical')}`, `a2ui-align-${pick(val(p.align), ALIGN, 'stretch')}`);
}

export const List = component({
  render: (p, ctx) => ctx.slot('children', { tag: 'div', attrs: { class: listClass(p), role: 'list' }, item: 'box', itemAttrs: { role: 'listitem' } }),
  update(el, p) { el.className = listClass(p); return true; },
});

export const Card = component({
  render: (p, ctx) => {
    const card = ctx.bw.makeCard({ content: ctx.slot('child', { attrs: { class: 'a2ui-card-slot' } }), class: 'a2ui-card' });
    return card;
  },
  update: () => true,
});

// ---- Tabs and Modal ------------------------------------------------------------------

function tabTitles(p) {
  return p.tabs.map(t => str(t.title));
}

function activeIndex(p, ctx) {
  return Math.min(ctx.state.active ?? 0, p.tabs.length - 1);     // tabs has at least one entry
}

export const Tabs = component({
  render(p, ctx) {
    const titles = tabTitles(p);
    const active = activeIndex(p, ctx);
    const select = i => { ctx.state.active = i; ctx.refresh(); };
    const onKey = e => {
      const n = tabTitles(ctx.p).length;
      const cur = activeIndex(ctx.p, ctx);
      const next = e.key === 'ArrowRight' ? (cur + 1) % n : e.key === 'ArrowLeft' ? (cur - 1 + n) % n
        : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
      if (next < 0 || !n) return;
      e.preventDefault();
      select(next);
      e.currentTarget.querySelectorAll('[role="tab"]')[next]?.focus();
    };
    return {
      t: 'div', a: { class: 'bw_bccl_tabs a2ui-tabs' },
      c: [
        { t: 'ul', a: { class: 'bw_nav bw_nav_tabs a2ui-tablist', role: 'tablist', onkeydown: ctx.on(onKey) },
          c: titles.map((title, i) => ({
            t: 'li', a: { class: 'bw_nav_item', role: 'presentation' },
            c: { t: 'button', a: {
              type: 'button', role: 'tab', id: ctx.id(`tab${i}`), class: cls('bw_nav_link', 'a2ui-tab-button', i === active && 'active'),
              'aria-selected': i === active ? 'true' : 'false', 'aria-controls': ctx.id('panel'), tabindex: i === active ? '0' : '-1',
              onclick: ctx.on(() => select(i)),
            }, c: title },
          })) },
        ctx.slot('panel', { attrs: { class: 'bw_bccl_tab_content a2ui-tabpanel', role: 'tabpanel', id: ctx.id('panel'), 'aria-labelledby': ctx.id(`tab${active}`) } }),
      ],
    };
  },
  update(el, p, ctx, prev) {
    const titles = tabTitles(p);
    if (tabTitles(prev).length !== titles.length) return false;
    const active = activeIndex(p, ctx);
    el.querySelectorAll('.a2ui-tab-button').forEach((b, i) => {
      setText(b, titles[i]);
      b.classList.toggle('active', i === active);
      b.setAttribute('aria-selected', i === active ? 'true' : 'false');
      b.setAttribute('tabindex', i === active ? '0' : '-1');
    });
    el.querySelector('.a2ui-tabpanel')?.setAttribute('aria-labelledby', ctx.id(`tab${active}`));
    return true;
  },
  slots(p, ctx) {
    const tab = p.tabs[activeIndex(p, ctx)];
    return { panel: [tab.child] };
  },
});

const FOCUSABLE_PARTS = ['a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])'];
const FOCUSABLE = FOCUSABLE_PARTS.join(',');
const within = scope => FOCUSABLE_PARTS.map(s => `${scope} ${s}`).join(',');

export const Modal = component({
  render(p, ctx) {
    const open = e => {
      if (ctx.state.open) return;
      ctx.state.open = true;
      ctx.state.opener = e.currentTarget.ownerDocument.activeElement;
      ctx.refresh();
    };
    const close = () => {
      if (!ctx.state.open) return;
      ctx.state.open = false;
      ctx.refresh();
      if (ctx.state.opener.isConnected) ctx.state.opener.focus();
    };
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      const items = [...e.currentTarget.querySelectorAll(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const doc = e.currentTarget.ownerDocument;
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    // Modal renders closed (update() never asks for a re-render); open() shows it.
    return {
      t: 'div', a: { class: 'a2ui-modal' },
      c: [
        ctx.slot('trigger', { attrs: { class: 'a2ui-modal-trigger', onclick: ctx.on(open) } }),
        { t: 'div', a: {
          class: 'a2ui-modal-overlay', style: 'display:none',
          onclick: ctx.on(e => { if (e.target === e.currentTarget) close(); }), onkeydown: ctx.on(onKey),
        },
        c: { t: 'div', a: { class: 'bw_bccl_modal_content a2ui-modal-dialog', role: 'dialog', 'aria-modal': 'true', tabindex: '-1' },
          c: [
            { t: 'button', a: { type: 'button', class: 'bw_close a2ui-modal-close', 'aria-label': 'Close', onclick: ctx.on(close) }, c: '×' },
            ctx.slot('content', { attrs: { class: 'bw_bccl_modal_body a2ui-modal-body' } }),
          ] } },
      ],
    };
  },
  update(el, p, ctx) {
    const overlay = el.querySelector('.a2ui-modal-overlay');
    const isOpen = !!ctx.state.open;
    const wasOpen = overlay.style.display !== 'none';
    overlay.style.display = isOpen ? '' : 'none';
    if (isOpen && !wasOpen) {
      // Focus the first control in the dialog after its content mounts.
      queueMicrotask(() => {
        const first = overlay.querySelector(within('.a2ui-modal-body')) ?? overlay.querySelector('.a2ui-modal-close');
        first?.focus();
      });
    }
    return true;
  },
  slots(p, ctx) {
    const out = { trigger: [p.trigger] };
    if (ctx.state.open && isNode(p.content)) out.content = [p.content];
    return out;
  },
});

// ---- inputs ------------------------------------------------------------------------

const BUTTON_VARIANT = { primary: 'primary', default: 'secondary', borderless: 'link' };

export const Button = component({
  render(p, ctx) {
    const variant = pick(val(p.variant), ['default', 'primary', 'borderless'], 'default');
    const taco = ctx.bw.makeButton({
      text: ctx.slot('child', { tag: 'span', attrs: { class: 'a2ui-button-label' } }),
      variant: BUTTON_VARIANT[variant],
      disabled: p.isValid === false,
      class: cls('a2ui-button', `a2ui-button--${variant}`),
      // The button is disabled while checks fail, so clicks only arrive when valid.
      // The action runs synchronously inside the native handler, so user activation
      // holds; failures reach the agent through the surface error channel.
      onclick: ctx.on(() => { Promise.resolve(ctx.p.action()).catch(() => {}); }),
    });
    return taco;
  },
  update(el, p, ctx, prev) {
    if (val(prev.variant) !== val(p.variant)) return false;
    el.disabled = p.isValid === false;
    return true;
  },
});

const TEXT_TYPES = { shortText: 'text', number: 'number', obscured: 'password' };

export const TextField = component({
  render(p, ctx) {
    const variant = pick(val(p.variant), ['shortText', 'longText', 'number', 'obscured'], 'shortText');
    const id = ctx.id('in');
    const onInput = ctx.on(e => {
      const b = ctx.p?.value;
      if (isWritable(b)) b.set(e.target.value);
    });
    const placeholder = str(p.placeholder) || undefined;
    const vy = validity(p, ctx);
    const control = variant === 'longText'
      ? ctx.bw.makeTextarea({ id, value: str(p.value), placeholder, oninput: onInput, rows: 3, ...vy.control })
      : ctx.bw.makeInput({ id, type: TEXT_TYPES[variant], value: str(p.value), placeholder, oninput: onInput, ...vy.control });
    return {
      t: 'div', a: { class: cls('bw_bccl_form_group', 'a2ui-textfield', `a2ui-textfield--${variant}`, vy.rootClass) },
      c: [
        { t: 'label', a: { for: id, class: 'bw_bccl_form_label a2ui-label' }, c: str(p.label) },
        control,
        ...feedbackTaco(p, ctx),
      ],
    };
  },
  update(el, p, ctx, prev) {
    if (val(prev.variant) !== val(p.variant)) return false;
    const input = el.querySelector('input,textarea');
    setProp(input, 'value', str(p.value));
    const ph = str(p.placeholder);
    if (ph) input.setAttribute('placeholder', ph); else input.removeAttribute('placeholder');
    setText(el.querySelector('.a2ui-label'), str(p.label));
    updateFeedback(el, p, input);
    return true;
  },
  a11yTarget: el => el.querySelector('input,textarea'),
});

export const CheckBox = component({
  render(p, ctx) {
    const box = ctx.bw.makeCheckbox({
      id: ctx.id('cb'), label: str(p.label), checked: val(p.value) === true,
      onchange: ctx.on(e => { const b = ctx.p?.value; if (isWritable(b)) b.set(!!e.target.checked); }),
      ...validity(p, ctx).control,
    });
    return { t: 'div', a: { class: cls('a2ui-checkbox', validity(p, ctx).rootClass) }, c: [box, ...feedbackTaco(p, ctx)] };
  },
  update(el, p) {
    const input = el.querySelector('input');
    setProp(input, 'checked', val(p.value) === true);
    setText(el.querySelector('label'), str(p.label));
    updateFeedback(el, p, input);
    return true;
  },
  a11yTarget: el => el.querySelector('input'),
});

function optionsOf(p) {
  return p.options.map(o => ({ label: str(o.label), value: String(val(o.value)) }));
}

function selected(p) {
  const v = val(p.value);
  return new Set(Array.isArray(v) ? v.map(String) : v === undefined || v === null ? [] : [String(v)]);
}

function choiceFilter(el, p, ctx) {
  const needle = String(ctx.state.filter ?? '').toLowerCase();
  const opts = optionsOf(p);
  el.querySelectorAll('.a2ui-option').forEach((row, i) => {
    const show = !needle || opts[i].label.toLowerCase().includes(needle);
    row.style.display = show ? '' : 'none';
  });
}

export const ChoicePicker = component({
  render(p, ctx) {
    const multi = val(p.variant) === 'multipleSelection';
    const chips = val(p.displayStyle) === 'chips';
    const sel = selected(p);
    const name = ctx.id('opt');
    const labelId = ctx.id('label');
    const label = str(p.label);
    const onChange = ctx.on(e => {
      const b = ctx.p?.value;
      if (!isWritable(b)) return;
      if (!multi) { b.set([e.target.value]); return; }
      const root = e.target.closest('.a2ui-choicepicker');
      b.set([...root.querySelectorAll('input.a2ui-option-input')].filter(i => i.checked).map(i => i.value));
    });
    const rows = optionsOf(p).map((o, i) => ({
      t: 'div', a: { class: cls('bw_bccl_form_check', 'a2ui-option', chips && 'a2ui-chip') },
      c: [
        { t: 'input', a: { type: multi ? 'checkbox' : 'radio', name, value: o.value, id: ctx.id(`o${i}`), checked: sel.has(o.value),
          class: 'bw_bccl_form_check_input a2ui-option-input', onchange: onChange } },
        { t: 'label', a: { for: ctx.id(`o${i}`), class: 'bw_bccl_form_check_label' }, c: o.label },
      ],
    }));
    const filter = val(p.filterable) === true ? [{ t: 'input', a: {
      type: 'search', class: 'bw_bccl_form_control a2ui-choice-filter', placeholder: 'Filter', 'aria-label': label ? `Filter ${label}` : 'Filter options',
      oninput: ctx.on(e => { ctx.state.filter = e.target.value; choiceFilter(e.target.closest('.a2ui-choicepicker'), ctx.p, ctx); }),
    } }] : [];
    return {
      t: 'div', a: {
        class: cls('a2ui-choicepicker', chips ? 'a2ui-choicepicker--chips' : 'a2ui-choicepicker--list', validity(p, ctx).rootClass),
        role: multi ? 'group' : 'radiogroup', 'aria-labelledby': label ? labelId : null,
      },
      c: [
        { t: 'div', a: { id: labelId, class: 'bw_bccl_form_label a2ui-label', style: label ? '' : 'display:none' }, c: label },
        ...filter,
        { t: 'div', a: { class: 'a2ui-options' }, c: rows },
        ...feedbackTaco(p, ctx),
      ],
    };
  },
  update(el, p, ctx, prev) {
    const before = JSON.stringify([optionsOf(prev), val(prev.variant), val(prev.displayStyle), val(prev.filterable)]);
    const after = JSON.stringify([optionsOf(p), val(p.variant), val(p.displayStyle), val(p.filterable)]);
    if (before !== after) return false;
    const sel = selected(p);
    el.querySelectorAll('input.a2ui-option-input').forEach(i => setProp(i, 'checked', sel.has(i.value)));
    const label = str(p.label);
    const lab = el.querySelector('.a2ui-label');
    setText(lab, label);
    lab.style.display = label ? '' : 'none';
    choiceFilter(el, p, ctx);
    updateFeedback(el, p, null);
    return true;
  },
});

function sliderStep(p) {
  const min = Number(val(p.min) ?? 0);
  const max = Number(val(p.max));
  const steps = Number(val(p.steps));
  return Number.isInteger(steps) && steps >= 1 && Number.isFinite(max) && max > min ? (max - min) / steps : 'any';
}

export const Slider = component({
  render(p, ctx) {
    const min = Number(val(p.min) ?? 0);
    const max = Number(val(p.max));
    const range = ctx.bw.makeRange({
      id: ctx.id('rg'), min, max, step: sliderStep(p), value: Number(val(p.value) ?? min), label: str(p.label), showValue: true,
      oninput: ctx.on(e => { const b = ctx.p?.value; if (isWritable(b)) b.set(Number(e.target.value)); }),
    });
    return { t: 'div', a: { class: cls('a2ui-slider', validity(p, ctx).rootClass) }, c: [range, ...feedbackTaco(p, ctx)] };
  },
  update(el, p, ctx, prev) {
    if ((val(prev.min) !== val(p.min) || val(prev.max) !== val(p.max) || val(prev.steps) !== val(p.steps))) return false;
    const input = el.querySelector('input[type="range"]');
    const v = String(Number(val(p.value) ?? 0));
    setProp(input, 'value', v);
    setText(el.querySelector('.bw_range_value'), v);
    const labelSpan = el.querySelector('.bw_range_label span');
    if (labelSpan) setText(labelSpan, str(p.label));
    updateFeedback(el, p, input);
    return true;
  },
  a11yTarget: el => el.querySelector('input[type="range"]'),
});

// DateTimeInput: A2UI values are ISO 8601 strings; native inputs use their own formats.
function dtKind(p) {
  const d = val(p.enableDate) === true;
  const t = val(p.enableTime) === true;
  return d && !t ? 'date' : t && !d ? 'time' : 'datetime-local';
}

/** ISO 8601 value -> native input value for the given input type. */
export function toInputValue(iso, kind) {
  const s = String(iso ?? '');
  if (!s) return '';
  const m = /^(\d{4}-\d{2}-\d{2})?(?:T?(\d{2}:\d{2}(?::\d{2})?))?/.exec(s.replace(' ', 'T'));
  const date = m?.[1] ?? '';
  const time = m[2] ?? '';
  if (kind === 'date') return date;
  if (kind === 'time') return time;
  return date && time ? `${date}T${time}` : date ? `${date}T00:00` : '';
}

/** Native input value -> ISO value, keeping seconds if the previous value had them. */
export function fromInputValue(v, kind, previous) {
  if (!v) return '';
  const hadSeconds = /T?\d{2}:\d{2}:\d{2}/.test(String(previous));
  if (kind === 'date') return v;
  if (/^\d{2}:\d{2}$/.test(v.slice(-5)) && hadSeconds && !/\d{2}:\d{2}:\d{2}$/.test(v)) return `${v}:00`;
  return v;
}

export const DateTimeInput = component({
  render(p, ctx) {
    const kind = dtKind(p);
    const id = ctx.id('dt');
    const onChange = ctx.on(e => {
      const b = ctx.p?.value;
      if (isWritable(b)) b.set(fromInputValue(e.target.value, dtKind(ctx.p), val(ctx.p.value)));
    });
    const label = str(p.label);
    const vy = validity(p, ctx);
    return {
      t: 'div', a: { class: cls('bw_bccl_form_group', 'a2ui-datetime', vy.rootClass) },
      c: [
        { t: 'label', a: { for: id, class: 'bw_bccl_form_label a2ui-label', style: label ? '' : 'display:none' }, c: label },
        ctx.bw.makeInput({
          id, type: kind, value: toInputValue(val(p.value), kind),
          min: toInputValue(val(p.min), kind) || undefined, max: toInputValue(val(p.max), kind) || undefined,
          step: kind === 'date' ? undefined : (/:\d{2}:\d{2}/.test(String(val(p.value) ?? '')) ? '1' : undefined),
          onchange: onChange, oninput: onChange, ...vy.control,
        }),
        ...feedbackTaco(p, ctx),
      ],
    };
  },
  update(el, p, ctx, prev) {
    const kind = dtKind(p);
    if (dtKind(prev) !== kind) return false;
    const input = el.querySelector('input');
    setProp(input, 'value', toInputValue(val(p.value), kind));
    const min = toInputValue(val(p.min), kind);
    const max = toInputValue(val(p.max), kind);
    if (min) input.setAttribute('min', min); else input.removeAttribute('min');
    if (max) input.setAttribute('max', max); else input.removeAttribute('max');
    const label = str(p.label);
    const lab = el.querySelector('.a2ui-label');
    setText(lab, label);
    lab.style.display = label ? '' : 'none';
    updateFeedback(el, p, input);
    return true;
  },
  a11yTarget: el => el.querySelector('input'),
});

/** All basic catalog implementations, by component name. */
export const BASIC_COMPONENTS = {
  Text, Image, Icon, Video, AudioPlayer, Row, Column, List, Card, Tabs, Modal, Divider,
  Button, TextField, CheckBox, ChoicePicker, Slider, DateTimeInput,
};
