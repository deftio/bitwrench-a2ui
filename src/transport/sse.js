// Server-Sent Events: one A2UI envelope (or a JSON array of envelopes) per event.
//
//   const close = connectSSE(renderer, '/agent/stream');
//
// Uses the browser's EventSource (which reconnects on its own). Outbound messages are
// up to the host: pass renderer `send` a function that POSTs to your agent.
import { collectEnvelopes } from './envelope.js';

/**
 * @param {{receive: Function}} renderer
 * @param {string} url
 * @param {{event?: string, EventSource?: Function, onError?: Function, withCredentials?: boolean}} [opts]
 * @returns {() => void} close function
 */
export function connectSSE(renderer, url, opts = {}) {
  const ES = opts.EventSource ?? globalThis.EventSource;
  if (typeof ES !== 'function') throw new Error('connectSSE: EventSource is not available');
  const es = new ES(url, { withCredentials: !!opts.withCredentials });
  const handler = ev => {
    const envelopes = collectEnvelopes(ev.data);
    if (envelopes.length) renderer.receive(envelopes);
  };
  es.addEventListener(opts.event ?? 'message', handler);
  if (opts.onError) es.addEventListener('error', opts.onError);
  return () => {
    es.removeEventListener(opts.event ?? 'message', handler);
    es.close();
  };
}
