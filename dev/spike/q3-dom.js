// Phase 0 spike, Q3: Form 4 instances (mount once, update in place) driven by web_core
// node.props, rendered with bitwrench, under jsdom. Checks:
//   - initial render from core
//   - typing into an input writes through the WritableBinding and updates other bindings
//   - an unrelated data update leaves the focused input's element, focus and caret alone
//   - an agent update to the input's own path updates its value without remounting it
//   - a child referenced before it arrives renders nothing, then upgrades in place
//   - a button click sends the v1.0 action with resolved context
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { pretendToBeVisual: true });
for (const k of ['window', 'document', 'Node', 'HTMLElement', 'Element', 'Event', 'InputEvent', 'MouseEvent', 'CustomEvent', 'getComputedStyle', 'requestAnimationFrame', 'navigator']) {
  if (!(k in globalThis) || k === 'navigator') {
    try { globalThis[k] = k === 'getComputedStyle' || k === 'requestAnimationFrame' ? dom.window[k].bind(dom.window) : dom.window[k]; } catch { /* read-only global */ }
  }
}
const { default: bw } = await import('bitwrench');
const core = await import('./entry.js');
const { effect, getValue } = core;

const results = [];
const check = (name, ok, detail) => results.push({ name, ok: !!ok, ...(detail !== undefined ? { detail } : {}) });

// ---- minimal adapter: dispatcher + signal bridge + four Form 4 implementations ----
const isNode = v => v && typeof v === 'object' && 'instanceId' in v;
const val = b => (b && typeof b === 'object' && 'value' in b) ? b.value : b;

// A view is keyed by instanceId. The node object behind an instanceId can change
// (placeholder upgrade, type change), so the view re-binds to the new node.
function mountNode(node, slot) {
  const holder = document.createElement('div');
  holder.style.display = 'contents';
  holder.dataset.a2uiInstance = node.instanceId;
  slot.appendChild(holder);
  let inst = null;
  let type = null;
  let stop = null;
  const bind = n => {
    if (stop) stop();
    stop = effect(() => {
      if (n.isPlaceholder || n.state !== 'resolved') {                 // render nothing
        if (inst) { inst.unmount(); inst = null; type = null; }
        return;
      }
      const props = getValue(n.props);
      if (!inst || type !== n.type) {
        if (inst) inst.unmount();
        type = n.type;
        inst = IMPLS[n.type].createInstance();
        inst.mount(holder, props);
      } else {
        inst.update(props);
      }
    });
  };
  bind(node);
  let current = node;
  return {
    holder,
    setNode(n) { if (n !== current) { current = n; bind(n); } },
    dispose() { stop && stop(); inst && inst.unmount(); holder.remove(); },
  };
}

// Children: keyed by instanceId so a placeholder upgrades in place.
function syncKids(slot, kids, cache) {
  const keep = new Set(kids.map(k => k.instanceId));
  for (const [id, v] of cache) if (!keep.has(id)) { v.dispose(); cache.delete(id); }
  for (const k of kids) {
    const v = cache.get(k.instanceId);
    if (v) v.setNode(k); else cache.set(k.instanceId, mountNode(k, slot));
  }
  for (const k of kids) slot.appendChild(cache.get(k.instanceId).holder);
}

let mounts = 0;
const IMPLS = {
  Column: { createInstance() { let el, cache = new Map(); return {
    mount(parent, p) { mounts++; el = bw.append(parent, { t: 'div', a: { class: 'a2ui-column', style: 'display:flex;flex-direction:column' } }); syncKids(el, (p.children || []).filter(isNode), cache); },
    update(p) { syncKids(el, (p.children || []).filter(isNode), cache); },
    unmount() { for (const v of cache.values()) v.dispose(); bw.remove(el); } }; } },
  Text: { createInstance() { let el; return {
    mount(parent, p) { mounts++; el = bw.append(parent, { t: 'p', c: String(val(p.text) ?? '') }); },
    update(p) { bw.patch(el, String(val(p.text) ?? '')); },
    unmount() { bw.remove(el); } }; } },
  TextField: { createInstance() { let el, input, binding; return {
    mount(parent, p) { mounts++; binding = p.value;
      el = bw.append(parent, { t: 'label', c: [String(val(p.label) ?? ''), { t: 'input', a: { type: 'text', value: String(val(p.value) ?? ''),
        oninput: e => binding && binding.set(e.target.value) } }] });
      input = el.querySelector('input'); },
    update(p) { binding = p.value; const v = String(val(p.value) ?? '');
      bw.patch(input, x => { if (x.value !== v) x.value = v; }); },
    unmount() { bw.remove(el); } }; } },
  Button: { createInstance() { let el, action, cache = new Map(), slot; return {
    mount(parent, p) { mounts++; action = p.action;
      el = bw.append(parent, { t: 'button', a: { type: 'button', onclick: () => action && action() } });
      slot = el; syncKids(slot, [p.child].filter(isNode), cache); },
    update(p) { action = p.action; syncKids(slot, [p.child].filter(isNode), cache); },
    unmount() { for (const v of cache.values()) v.dispose(); bw.remove(el); } }; } },
};

// ---- drive it ----------------------------------------------------------------
const catalog = core.makeBasicCatalog(name => IMPLS[name] ? { createInstance: IMPLS[name].createInstance } : {});
const actions = [];
const processor = new core.MessageProcessor([catalog], a => actions.push(a));
const send = msgs => processor.processMessagesWithErrors(msgs);
const S = 's1';
send([{ version: '1.0', createSurface: { surfaceId: S, catalogId: core.BASIC_CATALOG_ID,
  dataModel: { user: { name: 'Ada' }, clock: 0 },
  components: [
    { id: 'root', component: 'Column', children: ['greet', 'name', 'tick', 'later', 'go'] },
    { id: 'greet', component: 'Text', text: { '@call': 'formatString', args: { value: 'Hello, ${/user/name}!' } } },
    { id: 'name', component: 'TextField', label: 'Name', value: { '@path': '/user/name' } },
    { id: 'tick', component: 'Text', text: { '@call': 'formatString', args: { value: 'tick ${/clock}' } } },
    { id: 'goLabel', component: 'Text', text: 'Submit' },
    { id: 'go', component: 'Button', child: 'goLabel', action: { event: { name: 'submit', context: { name: { '@path': '/user/name' } } } } },
  ] } }]);

const surface = processor.getSurface(S);
const resolver = new core.NodeResolver(surface);
const app = document.getElementById('app');
let rootView = null;
effect(() => { const r = getValue(resolver.rootNode); if (r && !rootView) rootView = mountNode(r, app); });

const q = s => app.querySelector(s);
const texts = () => [...app.querySelectorAll('p')].map(p => p.textContent);
check('initial render', texts().includes('Hello, Ada!') && q('input').value === 'Ada', texts());
check('pending child renders nothing', !texts().some(t => t.startsWith('Later')), texts());

// type into the input
const input = q('input');
input.focus();
input.value = 'Grace';
input.setSelectionRange(2, 2);
input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
check('typing writes through binding', surface.dataModel.get('/user/name') === 'Grace');
check('other binding updated', texts().includes('Hello, Grace!'), texts());

// unrelated agent update while focused
const mountsBefore = mounts;
send([{ version: '1.0', updateDataModel: { surfaceId: S, path: '/clock', value: 1 } }]);
check('unrelated update applied', texts().includes('tick 1'), texts());
check('input element kept', q('input') === input);
check('focus kept', document.activeElement === input);
check('caret kept', input.selectionStart === 2 && input.selectionEnd === 2, [input.selectionStart, input.selectionEnd]);
check('no remounts on data update', mounts === mountsBefore, { mountsBefore, mounts });

// agent writes to the input's own path
send([{ version: '1.0', updateDataModel: { surfaceId: S, path: '/user/name', value: 'Linus' } }]);
check('agent update reaches input value', q('input').value === 'Linus' && q('input') === input);

// late child arrives
send([{ version: '1.0', updateComponents: { surfaceId: S, components: [{ id: 'later', component: 'Text', text: 'Later arrival' }] } }]);
check('late child upgrades in place', texts().includes('Later arrival'), texts());
check('order preserved', texts().indexOf('Later arrival') > texts().indexOf('tick 1'), texts());

// click the button
q('button').click();
await new Promise(r => setTimeout(r, 0));
check('button action sent', actions.length === 1 && actions[0].name === 'submit' && actions[0].context.name === 'Linus', actions);

// teardown
rootView.dispose(); resolver.dispose();
check('teardown empties DOM', app.children.length === 0);

const failed = results.filter(r => !r.ok);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
process.exit(failed.length ? 1 : 0);
