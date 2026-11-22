// A2A extension helpers (specification/v1_0/extensions/a2a).
//
// A2UI travels in A2A messages as DataParts whose metadata.mimeType is
// "application/a2ui+json" and whose data is an array of envelopes, in both directions.
// Renderer capabilities and the data model ride in the A2A message metadata.
import { A2UI_MIME_TYPE, collectEnvelopes } from './envelope.js';

export const A2A_EXTENSION_URI = 'https://a2ui.org/a2a-extension/a2ui/v1.0';

function isA2uiPart(part) {
  if (!part || typeof part !== 'object') return false;
  const mime = part.metadata?.mimeType ?? part.mimeType;
  return (part.kind === 'data' || 'data' in part) && mime === A2UI_MIME_TYPE;
}

/** Extract A2UI envelopes from an A2A message, task, artifact or parts array. */
export function fromA2A(value) {
  if (!value || typeof value !== 'object') return [];
  const parts = Array.isArray(value) ? value
    : Array.isArray(value.parts) ? value.parts
      : Array.isArray(value.status?.message?.parts) ? value.status.message.parts
        : Array.isArray(value.artifacts) ? value.artifacts.flatMap(a => a.parts ?? [])
          : [];
  return parts.filter(isA2uiPart).flatMap(p => collectEnvelopes(p.data));
}

/** Wrap outbound envelopes as an A2A DataPart. */
export function toA2APart(envelopes) {
  return { kind: 'data', data: Array.isArray(envelopes) ? envelopes : [envelopes], metadata: { mimeType: A2UI_MIME_TYPE } };
}

/**
 * Build an A2A user message carrying renderer-to-agent envelopes plus the A2UI metadata
 * (capabilities and, for surfaces with sendDataModel, the data model).
 * @param {object|object[]} envelopes
 * @param {object} metadata  renderer.metadata()
 * @param {{messageId?: string, contextId?: string, taskId?: string}} [ids]
 */
export function toA2AMessage(envelopes, metadata = {}, ids = {}) {
  const messageId = ids.messageId ?? (globalThis.crypto?.randomUUID?.() ?? `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
  return {
    kind: 'message', role: 'user', messageId,
    ...(ids.contextId ? { contextId: ids.contextId } : {}),
    ...(ids.taskId ? { taskId: ids.taskId } : {}),
    parts: [toA2APart(envelopes)],
    metadata,
  };
}

/** HTTP header that activates the extension. */
export const A2A_EXTENSION_HEADER = { 'X-A2A-Extensions': A2A_EXTENSION_URI };
