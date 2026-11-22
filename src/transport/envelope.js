// Recognizing A2UI v1.0 agent-to-renderer envelopes inside other payloads.

export const A2UI_MIME_TYPE = 'application/a2ui+json';

const AGENT_KEYS = ['createSurface', 'updateComponents', 'updateDataModel', 'deleteSurface', 'callRendererFunction', 'agentFunctionResponse'];

/** True for a v1.0 agent-to-renderer envelope. */
export function isEnvelope(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  if (x.version !== '1.0') return false;
  return AGENT_KEYS.some(k => k in x);
}

/** Collect envelopes from a value that may be an envelope, an array, {messages}, or JSON text. */
export function collectEnvelopes(value, depth = 0) {
  if (depth > 4 || value === null || value === undefined) return [];
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s || (s[0] !== '{' && s[0] !== '[')) return [];
    try { return collectEnvelopes(JSON.parse(s), depth + 1); } catch { return []; }
  }
  if (Array.isArray(value)) return value.flatMap(v => collectEnvelopes(v, depth + 1));
  if (isEnvelope(value)) return [value];
  if (typeof value === 'object' && Array.isArray(value.messages)) return collectEnvelopes(value.messages, depth + 1);
  return [];
}
