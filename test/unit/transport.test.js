import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { JsonlDecoder, parseJsonl, readJsonl, DEFAULT_MAX_LINE } from '../../src/transport/jsonl.js';
import { isEnvelope, collectEnvelopes, A2UI_MIME_TYPE } from '../../src/transport/envelope.js';
import { connectSSE } from '../../src/transport/sse.js';
import { connectWebSocket } from '../../src/transport/websocket.js';
import { fromA2A, toA2APart, toA2AMessage, A2A_EXTENSION_URI, A2A_EXTENSION_HEADER } from '../../src/transport/a2a.js';
import { fromAgUiEvent, connectAgUi } from '../../src/transport/agui.js';

const E = (k = 'deleteSurface') => ({ version: '1.0', [k]: { surfaceId: 's' } });

describe('jsonl', () => {
  it('splits lines across arbitrary chunk boundaries, CRLF and blank lines', () => {
    const d = new JsonlDecoder();
    const text = `${JSON.stringify(E())}\r\n\n${JSON.stringify(E('createSurface'))}\n{"version":"1.0"}`;
    const out = [];
    for (let i = 0; i < text.length; i += 3) out.push(...d.push(text.slice(i, i + 3)));
    out.push(...d.end());
    assert.equal(out.length, 3);
    assert.deepEqual(out[0].message, E());
    assert.equal(out[1].line, 3);
    assert.deepEqual(out[2].message, { version: '1.0' });
  });

  it('decodes UTF-8 split inside a multi-byte character', () => {
    const d = new JsonlDecoder();
    const bytes = new TextEncoder().encode('{"t":"héllo ✓"}\n');
    const out = [...d.push(bytes.slice(0, 7)), ...d.push(bytes.slice(7)), ...d.end()];
    assert.equal(out[0].message.t, 'héllo ✓');
  });

  it('reports bad lines and keeps going', () => {
    const items = [...new JsonlDecoder().push('{bad}\n{"ok":1}\n')];
    assert.match(items[0].error.message, /invalid JSON/);
    assert.equal(items[0].error.line, 1);
    assert.deepEqual(items[1].message, { ok: 1 });
  });

  it('caps line length and discards the rest of an over-long line', () => {
    const d = new JsonlDecoder({ maxLineLength: 10 });
    const out = [...d.push('{"a":"0123456789"'), ...d.push('}\n{"b":1}\n'), ...d.end()];
    assert.match(out[0].error.message, /exceeds 10/);
    assert.deepEqual(out.at(-1).message, { b: 1 });
    assert.ok(DEFAULT_MAX_LINE > 1000);
  });

  it('parseJsonl returns messages, strict mode throws', () => {
    assert.deepEqual(parseJsonl('{"a":1}\n{"b":2}'), [{ a: 1 }, { b: 2 }]);
    assert.deepEqual(parseJsonl('nope\n{"b":2}'), [{ b: 2 }]);
    assert.throws(() => parseJsonl('nope', { strict: true }), /JSONL line 1/);
  });

  it('readJsonl reads strings, async iterables and ReadableStreams', async () => {
    const collect = async src => { const out = []; for await (const i of readJsonl(src)) out.push(i.message); return out; };
    assert.deepEqual(await collect('{"a":1}\n{"a":2}'), [{ a: 1 }, { a: 2 }]);
    async function* gen() { yield '{"a":'; yield '1}\n'; }
    assert.deepEqual(await collect(gen()), [{ a: 1 }]);
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"x":1}\n')); c.close(); } });
    assert.deepEqual(await collect({ getReader: () => stream.getReader() }), [{ x: 1 }]);
  });
});

describe('envelope', () => {
  it('recognizes v1.0 agent envelopes only', () => {
    assert.ok(isEnvelope(E()));
    assert.ok(!isEnvelope({ version: 'v0.9', deleteSurface: {} }));
    assert.ok(!isEnvelope({ version: '1.0', action: {} }));
    assert.ok(!isEnvelope([E()]));
    assert.ok(!isEnvelope(null));
  });

  it('collects from arrays, {messages}, JSON text and ignores the rest', () => {
    assert.deepEqual(collectEnvelopes([E(), { x: 1 }]), [E()]);
    assert.deepEqual(collectEnvelopes({ messages: [E()] }), [E()]);
    assert.deepEqual(collectEnvelopes(JSON.stringify([E()])), [E()]);
    assert.deepEqual(collectEnvelopes('hello'), []);
    assert.deepEqual(collectEnvelopes('{bad json'), []);
    assert.deepEqual(collectEnvelopes(''), []);
    assert.deepEqual(collectEnvelopes(undefined), []);
    assert.deepEqual(collectEnvelopes(5), []);
    assert.deepEqual(collectEnvelopes([[[[[[E()]]]]]]), [], 'depth limited');
    assert.equal(A2UI_MIME_TYPE, 'application/a2ui+json');
  });
});

class FakeTarget {
  constructor() { this.l = {}; }
  addEventListener(t, f) { (this.l[t] ||= []).push(f); }
  removeEventListener(t, f) { this.l[t] = (this.l[t] || []).filter(x => x !== f); }
  fire(t, ev) { for (const f of this.l[t] || []) f(ev); }
}

describe('sse', () => {
  it('feeds envelopes to the renderer and closes', () => {
    let es;
    class ES extends FakeTarget { constructor(url, o) { super(); this.url = url; this.o = o; es = this; } close() { this.closed = true; } }
    const got = [];
    const errs = [];
    const close = connectSSE({ receive: m => got.push(m) }, '/s', { EventSource: ES, onError: e => errs.push(e), withCredentials: true });
    assert.equal(es.url, '/s');
    assert.equal(es.o.withCredentials, true);
    es.fire('message', { data: JSON.stringify(E()) });
    es.fire('message', { data: 'ping' });
    es.fire('error', 'boom');
    assert.deepEqual(got, [[E()]]);
    assert.deepEqual(errs, ['boom']);
    close();
    assert.ok(es.closed);
    es.fire('message', { data: JSON.stringify(E()) });
    assert.equal(got.length, 1);
  });

  it('supports a custom event name and requires EventSource', () => {
    let es;
    class ES extends FakeTarget { constructor() { super(); es = this; } close() {} }
    const got = [];
    connectSSE({ receive: m => got.push(m) }, '/s', { EventSource: ES, event: 'a2ui' });
    es.fire('a2ui', { data: JSON.stringify(E()) });
    assert.equal(got.length, 1);
    const saved = globalThis.EventSource;
    delete globalThis.EventSource;
    assert.throws(() => connectSSE({}, '/s'), /EventSource is not available/);
    if (saved) globalThis.EventSource = saved;
  });
});

describe('websocket', () => {
  it('receives frames, queues sends until open, wraps metadata', () => {
    let ws;
    class WS extends FakeTarget { constructor(url, p) { super(); this.url = url; this.p = p; this.readyState = 0; this.sent = []; ws = this; } send(x) { this.sent.push(x); } close() { this.closed = true; } }
    const got = [];
    const errs = [];
    const conn = connectWebSocket({ receive: m => got.push(m) }, 'wss://x', { WebSocket: WS, protocols: ['a2ui'], onError: e => errs.push(e) });
    assert.deepEqual(ws.p, ['a2ui']);
    conn.send({ a: 1 });
    conn.send({ b: 2 }, { m: 1 });
    assert.equal(ws.sent.length, 0);
    ws.readyState = 1;
    ws.fire('open');
    assert.deepEqual(ws.sent.map(s => JSON.parse(s)), [{ a: 1 }, { message: { b: 2 }, metadata: { m: 1 } }]);
    conn.send({ c: 3 }, {});
    assert.deepEqual(JSON.parse(ws.sent.at(-1)), { c: 3 });
    ws.fire('message', { data: JSON.stringify(E()) });
    ws.fire('message', { data: new Uint8Array(1) });
    ws.fire('error', 'e');
    assert.deepEqual(got, [[E()]]);
    assert.deepEqual(errs, ['e']);
    assert.equal(conn.socket, ws);
    conn.close();
    assert.ok(ws.closed);
  });

  it('requires WebSocket', () => {
    const saved = globalThis.WebSocket;
    delete globalThis.WebSocket;
    assert.throws(() => connectWebSocket({}, 'wss://x'), /WebSocket is not available/);
    if (saved) globalThis.WebSocket = saved;
  });
});

describe('a2a', () => {
  const part = toA2APart([E()]);
  it('wraps and unwraps DataParts', () => {
    assert.deepEqual(part, { kind: 'data', data: [E()], metadata: { mimeType: A2UI_MIME_TYPE } });
    assert.deepEqual(toA2APart(E()).data, [E()]);
    assert.deepEqual(fromA2A([part, { kind: 'text', text: 'hi' }]), [E()]);
    assert.deepEqual(fromA2A({ parts: [part] }), [E()]);
    assert.deepEqual(fromA2A({ status: { message: { parts: [part] } } }), [E()]);
    assert.deepEqual(fromA2A({ artifacts: [{ parts: [part] }, {}] }), [E()]);
    assert.deepEqual(fromA2A({ parts: [{ data: [E()], mimeType: A2UI_MIME_TYPE }] }), [E()]);
    assert.deepEqual(fromA2A({ parts: [null, { kind: 'data', data: [E()] }] }), []);
    assert.deepEqual(fromA2A({}), []);
    assert.deepEqual(fromA2A(null), []);
  });

  it('builds messages with metadata and ids', () => {
    const m = toA2AMessage([E()], { a2uiRendererCapabilities: {} }, { messageId: 'm1', contextId: 'c', taskId: 't' });
    assert.deepEqual(m, { kind: 'message', role: 'user', messageId: 'm1', contextId: 'c', taskId: 't', parts: [part], metadata: { a2uiRendererCapabilities: {} } });
    assert.ok(toA2AMessage(E()).messageId);
    const saved = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    assert.match(toA2AMessage(E()).messageId, /^m-/);
    assert.notEqual(toA2AMessage(E()).messageId, toA2AMessage(E()).messageId);
    Object.defineProperty(globalThis, 'crypto', { value: saved, configurable: true });
    assert.equal(A2A_EXTENSION_HEADER['X-A2A-Extensions'], A2A_EXTENSION_URI);
  });
});

describe('agui', () => {
  it('extracts envelopes from event fields and a2ui CUSTOM events', () => {
    assert.deepEqual(fromAgUiEvent({ type: 'TOOL_CALL_RESULT', content: JSON.stringify(E()) }), [E()]);
    assert.deepEqual(fromAgUiEvent({ type: 'STATE_SNAPSHOT', snapshot: { messages: [E()] } }), [E()]);
    assert.deepEqual(fromAgUiEvent({ type: 'CUSTOM', name: 'a2ui', value: [E()] }), [E()]);
    assert.deepEqual(fromAgUiEvent({ type: 'CUSTOM', name: 'A2UI.messages', other: 1 }), []);
    assert.deepEqual(fromAgUiEvent({ type: 'TEXT_MESSAGE_CONTENT', delta: 'hello' }), []);
    assert.deepEqual(fromAgUiEvent(null), []);
  });

  it('connects to subscribe() sources and async iterables', async () => {
    const got = [];
    const r = { receive: m => got.push(m) };
    let handler;
    const unsub1 = connectAgUi(r, { subscribe: h => { handler = h; return () => { handler = null; }; } });
    handler({ type: 'CUSTOM', name: 'a2ui', value: E() });
    handler({ type: 'RUN_STARTED' });
    unsub1();
    assert.equal(handler, null);
    let unsubscribed = false;
    connectAgUi(r, { subscribe: () => ({ unsubscribe: () => { unsubscribed = true; } }) })();
    assert.ok(unsubscribed);
    connectAgUi(r, { subscribe: () => undefined })();
    async function* events() { yield { value: E() }; yield { value: E() }; }
    const stop = connectAgUi(r, events());
    await new Promise(res => setTimeout(res, 5));
    stop();
    async function* slow() { yield { value: E() }; await new Promise(res => setTimeout(res, 5)); yield { value: E() }; }
    const stop2 = connectAgUi(r, slow());
    await new Promise(res => setTimeout(res, 1));
    stop2();
    await new Promise(res => setTimeout(res, 10));
    assert.equal(got.length, 4);
    assert.throws(() => connectAgUi(r, {}), /subscribe/);
  });
});
