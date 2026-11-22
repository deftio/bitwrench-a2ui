// WebSocket: one A2UI envelope (or a JSON array) per frame, in both directions.
//
//   const ws = connectWebSocket(renderer, 'wss://agent.example/a2ui');
//   createRenderer({ send: ws.send })   // or wire send after creation
import { collectEnvelopes } from './envelope.js';

/**
 * @param {{receive: Function}} renderer
 * @param {string} url
 * @param {{WebSocket?: Function, protocols?: string|string[], onError?: Function}} [opts]
 */
export function connectWebSocket(renderer, url, opts = {}) {
  const WS = opts.WebSocket ?? globalThis.WebSocket;
  if (typeof WS !== 'function') throw new Error('connectWebSocket: WebSocket is not available');
  const ws = new WS(url, opts.protocols);
  const queue = [];
  ws.addEventListener('message', ev => {
    const envelopes = collectEnvelopes(typeof ev.data === 'string' ? ev.data : '');
    if (envelopes.length) renderer.receive(envelopes);
  });
  ws.addEventListener('open', () => { while (queue.length) ws.send(queue.shift()); });
  if (opts.onError) ws.addEventListener('error', opts.onError);
  return {
    socket: ws,
    /** Send an outbound envelope with its metadata as {message, metadata}. */
    send(message, metadata) {
      const frame = JSON.stringify(metadata && Object.keys(metadata).length ? { message, metadata } : message);
      if (ws.readyState === 1) ws.send(frame); else queue.push(frame);
    },
    close: () => ws.close(),
  };
}
