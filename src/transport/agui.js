// AG-UI helpers.
//
// The A2UI spec names AG-UI as a transport binding but does not fix where envelopes sit
// inside AG-UI events; integrations such as CopilotKit carry them in CUSTOM events,
// tool-call results and state snapshots. This extractor is deliberately conservative:
// it pulls out values that are valid A2UI v1.0 agent-to-renderer envelopes (or arrays
// / {messages} wrappers of them, or JSON text of those) from the event fields where
// integrations put them, and ignores every other AG-UI event.

import { collectEnvelopes } from './envelope.js';

const FIELDS = ['value', 'content', 'result', 'delta', 'snapshot', 'data'];

/** Extract A2UI envelopes from one AG-UI event object. */
export function fromAgUiEvent(event) {
  if (!event || typeof event !== 'object') return [];
  const out = [];
  for (const f of FIELDS) if (f in event) out.push(...collectEnvelopes(event[f]));
  if (out.length === 0 && event.type === 'CUSTOM' && event.name && /a2ui/i.test(String(event.name))) {
    out.push(...collectEnvelopes(event.value));
  }
  return out;
}

/**
 * Subscribe a renderer to an AG-UI event source: anything with subscribe(fn) or an
 * async iterable of events. Returns an unsubscribe function when the source supports it.
 */
export function connectAgUi(renderer, source) {
  const handle = ev => {
    const envelopes = fromAgUiEvent(ev);
    if (envelopes.length) renderer.receive(envelopes);
  };
  if (source && typeof source.subscribe === 'function') {
    const sub = source.subscribe(handle);
    return () => (typeof sub === 'function' ? sub() : sub?.unsubscribe?.());
  }
  if (source && Symbol.asyncIterator in source) {
    let stopped = false;
    (async () => { for await (const ev of source) { if (stopped) break; handle(ev); } })();
    return () => { stopped = true; };
  }
  throw new TypeError('connectAgUi: source must have subscribe() or be async iterable');
}
