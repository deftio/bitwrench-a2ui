import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { window as w, tick } from '../helpers/dom.js';
import { render, fire, key } from '../helpers/a2ui.js';

const { toInputValue, fromInputValue } = await import('../../src/catalog/basic/components.js');

describe('Text', () => {
  it('renders markdown inline or as blocks and updates in place', () => {
    const t = render([{ id: 'root', component: 'Text', text: { '@path': '/t' }, variant: 'caption' }], { t: 'Hello *you*' });
    const el = t.el('root');
    assert.equal(el.tagName, 'SPAN');
    assert.ok(el.classList.contains('a2ui-text--caption'));
    assert.equal(el.querySelector('em').textContent, 'you');
    t.setData('/t', 'Plain');
    assert.equal(t.el('root'), el);
    assert.equal(el.textContent, 'Plain');
    t.setData('/t', 'More **bold**');
    assert.equal(el.querySelector('strong').textContent, 'bold');
    t.setData('/t', '# Heading\n\nbody');
    assert.notEqual(t.el('root'), el, 'switching to block re-renders');
    assert.equal(t.el('root').tagName, 'DIV');
    const blockEl = t.el('root');
    t.setData('/t', '# Other\n\ntext');
    assert.equal(t.el('root'), blockEl);
    assert.equal(blockEl.querySelector('h1').textContent, 'Other');
    t.setComponents([{ id: 'root', component: 'Text', text: { '@path': '/t' }, variant: 'body' }]);
    assert.ok(t.el('root').classList.contains('a2ui-text--body'));
    t.setData('/t', 42);
    assert.equal(t.el('root').textContent, '42');
  });
});

describe('Image, Icon, Video, AudioPlayer, Divider', () => {
  it('Image applies URL policy, fit and variant, and updates', () => {
    const t = render([{ id: 'root', component: 'Image', url: { '@path': '/u' }, fit: 'scaleDown', variant: 'avatar', description: 'pic' }], { u: 'https://x.example/a.png' });
    const img = t.el('root');
    assert.equal(img.getAttribute('src'), 'https://x.example/a.png');
    assert.equal(img.getAttribute('alt'), 'pic');
    assert.match(img.getAttribute('style'), /scale-down/);
    assert.ok(img.classList.contains('a2ui-image--avatar'));
    t.setData('/u', 'javascript:alert(1)');
    assert.equal(img.getAttribute('src'), null);
    assert.ok(img.classList.contains('a2ui-image--blocked'));
  });

  it('Icon renders known names, svgPath, bound names and unknown names', () => {
    const t = render([
      { id: 'root', component: 'Row', children: ['a', 'b', 'c', 'd', 'e'] },
      { id: 'a', component: 'Icon', name: 'home' },
      { id: 'b', component: 'Icon', name: { svgPath: 'M0 0 L10 10 Z' } },
      { id: 'c', component: 'Icon', name: { '@path': '/icon' } },
      { id: 'd', component: 'Icon', name: { '@path': '/unknown' } },
      { id: 'e', component: 'Icon', name: 'star', '@accessibility': { label: 'Favorite' } },
    ], { icon: 'mail', unknown: 'notARealIcon' });
    assert.ok(t.el('a').querySelector('path').getAttribute('d').length > 10);
    assert.equal(t.el('a').getAttribute('aria-hidden'), 'true');
    assert.equal(t.el('b').querySelector('path').getAttribute('d'), 'M0 0 L10 10 Z');
    assert.equal(t.el('c').getAttribute('data-icon'), 'mail');
    t.setData('/icon', 'call');
    assert.equal(t.el('c').getAttribute('data-icon'), 'call');
    assert.equal(t.el('d').querySelector('path'), null);
    assert.equal(t.el('e').getAttribute('role'), 'img');
    assert.equal(t.el('e').getAttribute('aria-label'), 'Favorite');
  });

  it('Video, AudioPlayer and Divider', () => {
    const t = render([
      { id: 'root', component: 'Column', children: ['v', 'a', 'h', 'x'] },
      { id: 'v', component: 'Video', url: { '@path': '/v' }, posterUrl: 'https://x.example/p.png' },
      { id: 'a', component: 'AudioPlayer', url: { '@path': '/a' }, description: { '@path': '/d' } },
      { id: 'h', component: 'Divider' },
      { id: 'x', component: 'Divider', axis: 'vertical' },
    ], { v: 'https://x.example/v.mp4', a: 'https://x.example/a.mp3', d: '' });
    assert.equal(t.el('v').getAttribute('poster'), 'https://x.example/p.png');
    t.setData('/v', 'https://x.example/w.mp4');
    assert.equal(t.el('v').getAttribute('src'), 'https://x.example/w.mp4');
    const cap = t.el('a').querySelector('figcaption');
    assert.equal(cap.style.display, 'none');
    t.setData('/d', 'Episode');
    assert.equal(cap.textContent, 'Episode');
    assert.equal(cap.style.display, '');
    t.setData('/a', 'https://x.example/b.mp3');
    assert.equal(t.el('a').querySelector('audio').getAttribute('src'), 'https://x.example/b.mp3');
    assert.equal(t.el('h').tagName, 'HR');
    assert.equal(t.el('x').getAttribute('aria-orientation'), 'vertical');
    const before = t.el('x');
    t.setComponents([{ id: 'x', component: 'Divider', axis: 'vertical' }]);
    assert.equal(t.el('x'), before);
    t.setComponents([{ id: 'x', component: 'Divider', axis: 'horizontal' }]);
    assert.equal(t.el('x').tagName, 'HR');
  });
});

describe('layout', () => {
  it('Row/Column/List apply justify, align, direction and weight', () => {
    const t = render([
      { id: 'root', component: 'Row', justify: 'spaceBetween', align: 'center', children: ['l', 'r'] },
      { id: 'l', component: 'List', direction: 'horizontal', children: ['x'] },
      { id: 'x', component: 'Text', text: 'x' },
      { id: 'r', component: 'Text', text: 'r', weight: 2 },
    ]);
    const row = t.el('root');
    assert.ok(row.classList.contains('a2ui-justify-spaceBetween') && row.classList.contains('a2ui-align-center'));
    assert.equal(t.view('r').holder.style.flex, '2 1 0%');
    assert.equal(t.el('l').getAttribute('role'), 'list');
    assert.equal(t.view('x').holder.getAttribute('role'), 'listitem');
    t.setComponents([{ id: 'root', component: 'Row', justify: 'end', align: 'start', children: ['l', 'r'] }, { id: 'l', component: 'List', direction: 'vertical', align: 'end', children: ['x'] }]);
    assert.ok(row.classList.contains('a2ui-justify-end') && row.classList.contains('a2ui-align-start'));
    assert.ok(t.el('l').classList.contains('a2ui-list--vertical') && t.el('l').classList.contains('a2ui-align-end'));
  });

  it('Card keeps its child across updates', () => {
    const t = render([{ id: 'root', component: 'Card', child: 'c' }, { id: 'c', component: 'Text', text: 'in' }]);
    const card = t.el('root');
    t.setComponents([{ id: 'root', component: 'Card', child: 'c' }]);
    assert.equal(t.el('root'), card);
    assert.equal(card.textContent, 'in');
  });
});

describe('Tabs', () => {
  it('switches panes by click and keyboard, clamps, and re-renders when tabs change', () => {
    const t = render([
      { id: 'root', component: 'Tabs', tabs: [{ title: 'A', child: 'a' }, { title: { '@path': '/bt' }, child: 'b' }] },
      { id: 'a', component: 'Text', text: 'pane A' }, { id: 'b', component: 'Text', text: 'pane B' }, { id: 'c', component: 'Text', text: 'pane C' },
    ], { bt: 'B' });
    const el = t.el('root');
    const tabs = () => el.querySelectorAll('[role="tab"]');
    assert.equal(tabs()[1].textContent, 'B');
    assert.ok(el.textContent.includes('pane A') && !el.textContent.includes('pane B'));
    tabs()[1].click();
    assert.ok(t.el('root').textContent.includes('pane B'));
    assert.equal(tabs()[1].getAttribute('aria-selected'), 'true');
    t.setData('/bt', 'Bee');
    assert.equal(tabs()[1].textContent, 'Bee');
    const list = el.querySelector('[role="tablist"]');
    key(list, 'ArrowRight');
    assert.ok(el.textContent.includes('pane A'));
    key(list, 'ArrowLeft');
    assert.ok(el.textContent.includes('pane B'));
    key(list, 'Home');
    assert.ok(el.textContent.includes('pane A'));
    key(list, 'End');
    assert.ok(el.textContent.includes('pane B'));
    key(list, 'x');
    t.setComponents([{ id: 'root', component: 'Tabs', tabs: [{ title: 'A', child: 'a' }, { title: 'B', child: 'b' }, { title: 'C', child: 'c' }] }]);
    assert.equal(t.el('root').querySelectorAll('[role="tab"]').length, 3);
    t.setComponents([{ id: 'root', component: 'Tabs', tabs: [{ title: 'A', child: 'a' }] }]);
    assert.ok(t.el('root').textContent.includes('pane A'));
  });

  it('empty tablist does not throw on keys', () => {
    const t = render([{ id: 'root', component: 'Tabs', tabs: [{ title: 'only', child: 'missing' }] }]);
    key(t.el('root').querySelector('[role="tablist"]'), 'ArrowRight');
    assert.ok(t.el('root'));
  });
});

describe('Modal', () => {
  it('opens from the trigger, traps focus, closes on Escape, backdrop and close button', async () => {
    const t = render([
      { id: 'root', component: 'Modal', trigger: 'open', content: 'body' },
      { id: 'open', component: 'Button', child: 'ol', action: { event: { name: 'opened' } } }, { id: 'ol', component: 'Text', text: 'Open' },
      { id: 'body', component: 'Column', children: ['f1', 'f2'] },
      { id: 'f1', component: 'TextField', label: 'One', value: '' }, { id: 'f2', component: 'TextField', label: 'Two', value: '' },
    ]);
    const el = t.el('root');
    const overlay = el.querySelector('.a2ui-modal-overlay');
    assert.equal(overlay.style.display, 'none');
    const opener = el.querySelector('button.a2ui-button');
    opener.focus();
    opener.click();
    assert.equal(overlay.style.display, '');
    assert.ok(el.textContent.includes('One'));
    await tick();
    const inputs = overlay.querySelectorAll('input');
    assert.equal(w.document.activeElement, inputs[0]);
    const dialog = overlay;
    inputs[1].focus();
    key(dialog, 'Tab');
    assert.equal(w.document.activeElement, overlay.querySelector('.a2ui-modal-close'));
    key(dialog, 'Tab', { shiftKey: true });
    assert.equal(w.document.activeElement, inputs[1]);
    inputs[1].focus();
    key(dialog, 'Tab', { shiftKey: false });
    key(dialog, 'Tab', { shiftKey: true });
    key(dialog, 'a');
    opener.click();     // already open: no-op
    key(dialog, 'Escape');
    assert.equal(overlay.style.display, 'none');
    assert.equal(w.document.activeElement, opener);
    assert.ok(!el.textContent.includes('One'));
    opener.click();
    overlay.querySelector('.a2ui-modal-dialog').click();
    assert.equal(overlay.style.display, '');
    fire(overlay, 'click');
    assert.equal(overlay.style.display, 'none');
    opener.click();
    overlay.querySelector('.a2ui-modal-close').click();
    assert.equal(overlay.style.display, 'none');
    overlay.querySelector('.a2ui-modal-close').click();   // already closed
  });

  it('focus trap with no focusable content, and an opener that left the DOM', async () => {
    const t = render([{ id: 'root', component: 'Modal', trigger: 'tr', content: 'body' }, { id: 'tr', component: 'Text', text: 'open me' }, { id: 'body', component: 'Text', text: 'just text' }]);
    const el = t.el('root');
    el.querySelector('.a2ui-modal-trigger').click();
    const overlay = el.querySelector('.a2ui-modal-overlay');
    await tick();
    overlay.querySelector('.a2ui-modal-close').remove();
    key(overlay, 'Tab');
    key(overlay, 'Escape');
    assert.equal(overlay.style.display, 'none');
  });
});

describe('Button', () => {
  it('sends actions, honours checks, and switches variant', async () => {
    const t = render([
      { id: 'root', component: 'Column', children: ['f', 'b'] },
      { id: 'f', component: 'TextField', label: 'Email', value: { '@path': '/e' } },
      { id: 'b', component: 'Button', child: 'bl', variant: 'primary', action: { event: { name: 'go', context: { e: { '@path': '/e' } } } },
        '@checks': [{ condition: { '@call': 'required', args: { value: { '@path': '/e' } } }, message: 'Required' }] },
      { id: 'bl', component: 'Text', text: 'Go' },
    ], { e: '' });
    const btn = t.el('b');
    assert.equal(btn.disabled, true);
    btn.click();
    assert.equal(t.sent.length, 0);
    t.setData('/e', 'a@b.c');
    assert.equal(btn.disabled, false);
    btn.click();
    await tick();
    assert.equal(t.sent.at(-1).m.action.context.e, 'a@b.c');
    t.setComponents([{ id: 'b', component: 'Button', child: 'bl', variant: 'borderless', action: { event: { name: 'go' } } }]);
    assert.notEqual(t.el('b'), btn);
    assert.ok(t.el('b').classList.contains('a2ui-button--borderless'));
  });

  it('a button with no action does nothing', () => {
    const t = render([{ id: 'root', component: 'Button', child: 'l', action: { functionCall: { '@call': 'openUrl', args: { url: 'https://x.example' } } } }, { id: 'l', component: 'Text', text: 'x' }]);
    const orig = w.open;
    let opened = null;
    w.open = u => { opened = u; return null; };
    t.el('root').click();
    w.open = orig;
    assert.ok(opened === null || typeof opened === 'string');
  });
});

describe('TextField', () => {
  it('variants, two-way binding, placeholder, label and feedback', () => {
    const t = render([
      { id: 'root', component: 'Column', children: ['a', 'b', 'c', 'd'] },
      { id: 'a', component: 'TextField', label: { '@path': '/lab' }, value: { '@path': '/v' }, placeholder: 'type', '@checks': [{ condition: { '@call': 'email', args: { value: { '@path': '/v' } } }, message: 'Bad email' }] },
      { id: 'b', component: 'TextField', label: 'Long', value: 'x', variant: 'longText' },
      { id: 'c', component: 'TextField', label: 'Num', value: '1', variant: 'number' },
      { id: 'd', component: 'TextField', label: 'Pw', value: '', variant: 'obscured', checks: [{ condition: { '@path': '/hint' } }] },
    ], { v: 'nope', lab: 'Email', hint: { valid: false, message: 'Consider a longer password', severity: 'warning' } });
    const a = t.el('a');
    const input = a.querySelector('input');
    assert.equal(input.getAttribute('placeholder'), 'type');
    assert.ok(a.classList.contains('a2ui-invalid'));
    assert.equal(input.getAttribute('aria-invalid'), 'true');
    assert.ok(a.textContent.includes('Bad email'));
    input.value = 'me@example.com';
    fire(input, 'input');
    assert.equal(t.model('/v'), 'me@example.com');
    assert.ok(!a.classList.contains('a2ui-invalid'));
    assert.equal(input.getAttribute('aria-invalid'), null);
    t.setData('/lab', 'Your email');
    assert.equal(a.querySelector('label').textContent, 'Your email');
    t.setComponents([{ id: 'a', component: 'TextField', label: 'Email', value: { '@path': '/v' }, placeholder: '' }]);
    assert.equal(t.el('a').querySelector('input').getAttribute('placeholder'), null);
    assert.equal(t.el('b').querySelector('textarea').value, 'x');
    assert.equal(t.el('c').querySelector('input').type, 'number');
    assert.equal(t.el('d').querySelector('input').type, 'password');
    assert.ok(t.el('d').querySelector('.a2ui-hint--warning').textContent.includes('longer'));
    t.setComponents([{ id: 'd', component: 'TextField', label: 'Pw', value: '', variant: 'shortText' }]);
    assert.equal(t.el('d').querySelector('input').type, 'text');
    const literal = t.el('c').querySelector('input');
    literal.value = '2';
    fire(literal, 'input');           // literal value: not writable, ignored
    assert.equal(t.view('c').p.value.value, '1');
  });
});

describe('CheckBox, ChoicePicker, Slider, DateTimeInput', () => {
  it('CheckBox two-way binding and label update', () => {
    const t = render([{ id: 'root', component: 'CheckBox', label: { '@path': '/l' }, value: { '@path': '/c' } }], { c: false, l: 'Agree' });
    const cb = t.el('root').querySelector('input');
    cb.checked = true;
    fire(cb, 'change');
    assert.equal(t.model('/c'), true);
    t.setData('/c', false);
    assert.equal(cb.checked, false);
    t.setData('/l', 'I agree');
    assert.equal(t.el('root').querySelector('label').textContent, 'I agree');
  });

  it('ChoicePicker single, multiple, chips and filter', () => {
    const t = render([
      { id: 'root', component: 'Column', children: ['one', 'many'] },
      { id: 'one', component: 'ChoicePicker', label: 'Pick', options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }], value: { '@path': '/one' } },
      { id: 'many', component: 'ChoicePicker', variant: 'multipleSelection', displayStyle: 'chips', filterable: true,
        options: [{ label: 'Red', value: 'r' }, { label: 'Green', value: 'g' }, { label: 'Blue', value: 'b' }], value: { '@path': '/many' } },
    ], { one: ['a'], many: [] });
    const one = t.el('one');
    assert.equal(one.getAttribute('role'), 'radiogroup');
    const radios = one.querySelectorAll('input');
    radios[1].checked = true;
    fire(radios[1], 'change');
    assert.deepEqual(t.model('/one'), ['b']);
    t.setData('/one', ['a']);
    assert.equal(radios[0].checked, true);
    const many = t.el('many');
    assert.equal(many.getAttribute('role'), 'group');
    assert.ok(many.classList.contains('a2ui-choicepicker--chips'));
    const boxes = many.querySelectorAll('input.a2ui-option-input');
    boxes[0].checked = true; fire(boxes[0], 'change');
    boxes[2].checked = true; fire(boxes[2], 'change');
    assert.deepEqual(t.model('/many'), ['r', 'b']);
    const filter = many.querySelector('.a2ui-choice-filter');
    filter.value = 'gre';
    fire(filter, 'input');
    const rows = many.querySelectorAll('.a2ui-option');
    assert.deepEqual([...rows].map(r => r.style.display), ['none', '', 'none']);
    t.setData('/many', ['g']);
    assert.equal(many.querySelectorAll('.a2ui-option')[0].style.display, 'none', 'filter kept across updates');
    t.setComponents([{ id: 'one', component: 'ChoicePicker', label: '', options: [{ label: 'A', value: 'a' }], value: ['a'] }]);
    const one2 = t.el('one');
    assert.notEqual(one2, one, 'changed options re-render');
    assert.equal(one2.querySelector('.a2ui-label').style.display, 'none');
    t.setComponents([{ id: 'one', component: 'ChoicePicker', label: 'Now labelled', options: [{ label: 'A', value: 'a' }], value: [] }]);
    assert.equal(t.el('one'), one2, 'same options update in place');
    assert.equal(one2.querySelector('.a2ui-label').style.display, '');
    assert.equal(one2.querySelector('input').checked, false);
  });

  it('Slider steps, two-way binding and value display', () => {
    const t = render([{ id: 'root', component: 'Slider', label: { '@path': '/l' }, min: 0, max: 10, steps: 5, value: { '@path': '/v' } }], { v: 4, l: 'Vol' });
    const input = t.el('root').querySelector('input');
    assert.equal(input.getAttribute('step'), '2');
    input.value = '8';
    fire(input, 'input');
    assert.equal(t.model('/v'), 8);
    t.setData('/v', 6);
    assert.equal(input.value, '6');
    assert.equal(t.el('root').querySelector('.bw_range_value').textContent, '6');
    t.setData('/l', 'Volume');
    assert.equal(t.el('root').querySelector('.bw_range_label span').textContent, 'Volume');
    t.setComponents([{ id: 'root', component: 'Slider', min: 0, max: 20, steps: 4, value: { '@path': '/v' } }]);
    assert.equal(t.el('root').querySelector('input').getAttribute('step'), '5');
  });

  it('Slider with no steps is continuous', () => {
    const t = render([{ id: 'root', component: 'Slider', max: 1, value: 0.5 }]);
    assert.equal(t.el('root').querySelector('input').getAttribute('step'), 'any');
  });

  it('DateTimeInput kinds, conversion and two-way binding', () => {
    const t = render([
      { id: 'root', component: 'Column', children: ['d', 't', 'dt'] },
      { id: 'd', component: 'DateTimeInput', label: 'Date', enableDate: true, value: { '@path': '/d' }, min: '2025-01-01', max: '2025-12-31' },
      { id: 't', component: 'DateTimeInput', enableTime: true, value: { '@path': '/t' } },
      { id: 'dt', component: 'DateTimeInput', label: { '@path': '/l' }, value: { '@path': '/dt' } },
    ], { d: '2025-06-15', t: '09:30', dt: '2025-06-15T09:30:00', l: 'When' });
    const d = t.el('d').querySelector('input');
    assert.equal(d.type, 'date');
    assert.equal(d.getAttribute('min'), '2025-01-01');
    d.value = '2025-07-01'; fire(d, 'change');
    assert.equal(t.model('/d'), '2025-07-01');
    assert.equal(t.el('t').querySelector('input').type, 'time');
    const dt = t.el('dt').querySelector('input');
    assert.equal(dt.type, 'datetime-local');
    dt.value = '2025-06-16T10:00'; fire(dt, 'input');
    assert.equal(t.model('/dt'), '2025-06-16T10:00:00');
    t.setData('/l', '');
    assert.equal(t.el('dt').querySelector('.a2ui-label').style.display, 'none');
    t.setComponents([{ id: 'd', component: 'DateTimeInput', enableDate: true, value: { '@path': '/d' }, min: '2025-02-01', max: '2025-03-01' }]);
    assert.equal(t.el('d').querySelector('input').getAttribute('min'), '2025-02-01');
    assert.equal(t.el('d').querySelector('input').getAttribute('max'), '2025-03-01');
    t.setComponents([{ id: 'd', component: 'DateTimeInput', enableDate: true, value: { '@path': '/d' }, min: '', max: '' }]);
    assert.equal(t.el('d').querySelector('input').getAttribute('min'), null);
    assert.equal(t.el('d').querySelector('input').getAttribute('max'), null);
    t.setComponents([{ id: 'd', component: 'DateTimeInput', enableDate: false, enableTime: true, value: { '@path': '/d' } }]);
    assert.equal(t.el('d').querySelector('input').type, 'time');
  });

  it('date conversion helpers', () => {
    assert.equal(toInputValue('', 'date'), '');
    assert.equal(toInputValue('2025-01-02T03:04:05Z', 'date'), '2025-01-02');
    assert.equal(toInputValue('2025-01-02T03:04:05Z', 'time'), '03:04:05');
    assert.equal(toInputValue('03:04', 'time'), '03:04');
    assert.equal(toInputValue('2025-01-02', 'datetime-local'), '2025-01-02T00:00');
    assert.equal(toInputValue('2025-01-02 03:04', 'datetime-local'), '2025-01-02T03:04');
    assert.equal(toInputValue('junk', 'datetime-local'), '');
    assert.equal(fromInputValue('', 'date', ''), '');
    assert.equal(fromInputValue('2025-01-02', 'date', 'x'), '2025-01-02');
    assert.equal(fromInputValue('10:00', 'time', '09:00:00'), '10:00:00');
    assert.equal(fromInputValue('10:00:30', 'time', '09:00:00'), '10:00:30');
    assert.equal(fromInputValue('10:00', 'time', '09:00'), '10:00');
  });
});
