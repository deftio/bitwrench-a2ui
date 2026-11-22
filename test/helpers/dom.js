// Installs a jsdom window as the global environment, once per test process.
// Import this module first (before anything that imports bitwrench) in DOM tests.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  pretendToBeVisual: true,
  url: 'https://example.test/',
});
const w = dom.window;

const KEYS = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'Event', 'KeyboardEvent',
  'MouseEvent', 'InputEvent', 'CustomEvent', 'DocumentFragment', 'Text', 'getComputedStyle', 'requestAnimationFrame',
  'cancelAnimationFrame', 'MutationObserver', 'SVGElement', 'HTMLDialogElement', 'navigator', 'EventSource', 'WebSocket'];
for (const k of KEYS) {
  if (!(k in w)) continue;
  const v = typeof w[k] === 'function' && /^[a-z]/.test(k) ? w[k].bind(w) : w[k];
  try {
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  } catch { /* some globals are read-only */ }
}

export { dom, w as window };

/** Fresh mount point in an empty body. */
export function freshMount(id = 'app') {
  w.document.body.innerHTML = '';
  w.document.head.querySelectorAll('style').forEach(s => s.remove());
  const el = w.document.createElement('div');
  el.id = id;
  w.document.body.appendChild(el);
  return el;
}

/** Fire an input-style event after setting a property. */
export function input(el, value, type = 'input') {
  if (typeof value === 'boolean') el.checked = value; else el.value = value;
  el.dispatchEvent(new w.Event(type, { bubbles: true }));
}

export const tick = () => new Promise(r => setTimeout(r, 0));
