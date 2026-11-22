// JSONL framing: one A2UI envelope per line.
//
// Handles arbitrary chunk boundaries (including inside multi-byte UTF-8 characters),
// CRLF line endings, several envelopes per chunk, blank lines, a final line with no
// newline, and an upper bound on line length. Parse errors are reported per line and
// do not stop the stream.

export const DEFAULT_MAX_LINE = 4 * 1024 * 1024;

/** Incremental JSONL decoder. push() returns the items completed by that chunk. */
export class JsonlDecoder {
  constructor({ maxLineLength = DEFAULT_MAX_LINE } = {}) {
    this.maxLineLength = maxLineLength;
    this.buffer = '';
    this.line = 0;
    this.decoder = new TextDecoder('utf-8');
    this.overflow = false;
  }

  /** @param {string|Uint8Array} chunk */
  push(chunk) {
    const text = typeof chunk === 'string' ? chunk : this.decoder.decode(chunk, { stream: true });
    const out = [];
    this.buffer += text;
    let nl;
    while ((nl = this.buffer.indexOf('\n')) >= 0) {
      const raw = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + 1);
      this.#line(raw, out);
    }
    if (this.buffer.length > this.maxLineLength) {
      this.line++;
      out.push({ error: { line: this.line, message: `line exceeds ${this.maxLineLength} characters` } });
      this.buffer = '';
      this.overflow = true;            // discard the rest of this line
    }
    return out;
  }

  /** Flush the final unterminated line. */
  end() {
    const out = [];
    this.buffer += this.decoder.decode();
    if (this.buffer.length) this.#line(this.buffer, out);
    this.buffer = '';
    return out;
  }

  #line(raw, out) {
    if (this.overflow) { this.overflow = false; return; }
    this.line++;
    const text = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (!text.trim()) return;
    try {
      out.push({ message: JSON.parse(text), line: this.line });
    } catch (e) {
      out.push({ error: { line: this.line, message: `invalid JSON: ${e.message}`, text: text.slice(0, 200) } });
    }
  }
}

/** Parse a complete JSONL string into envelopes (throws on the first bad line if strict). */
export function parseJsonl(text, { strict = false } = {}) {
  const d = new JsonlDecoder();
  const items = [...d.push(text), ...d.end()];
  const errors = items.filter(i => i.error);
  if (strict && errors.length) throw new SyntaxError(`JSONL line ${errors[0].error.line}: ${errors[0].error.message}`);
  return items.filter(i => i.message).map(i => i.message);
}

/**
 * Iterate a JSONL source: a string, an async iterable of chunks, or a ReadableStream.
 * Yields {message, line} or {error}.
 */
export async function* readJsonl(source, opts) {
  const d = new JsonlDecoder(opts);
  if (typeof source === 'string') {
    yield* d.push(source);
    yield* d.end();
    return;
  }
  const iterable = source && typeof source.getReader === 'function' && !(Symbol.asyncIterator in source)
    ? streamIterator(source)
    : source;
  for await (const chunk of iterable) yield* d.push(chunk);
  yield* d.end();
}

async function* streamIterator(stream) {
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}
