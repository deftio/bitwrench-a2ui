// bitwrench-a2ui: an A2UI v1.0 renderer for plain JavaScript, built on bitwrench.
//
//   import { createRenderer } from 'bitwrench-a2ui';
//   const renderer = createRenderer({ mount: '#app', send: msg => agent.post(msg) });
//   renderer.receive(a2uiMessages);
export { createRenderer, createBasicCatalog, viewTree } from './renderer.js';
export { buildCatalog, makeFunction, normalizeMessage, BASIC_CATALOG_ID, PROTOCOL_VERSION, VALIDATION } from './core/webcore.js';
export { component } from './catalog/define.js';
export { BASIC_COMPONENTS } from './catalog/basic/components.js';
export { ICONS, ICON_VIEWBOX } from './catalog/basic/icons.js';
export { default as BASIC_CATALOG_DOCUMENT } from './catalog/basic/catalog-json.js';
export { markdownToTaco } from './render/markdown.js';
export { safeMediaUrl, isHttpUrl, isSafeColor } from './render/safety.js';
export { themeCss, resolveThemeConfig } from './theme/theme.js';
export { JsonlDecoder, parseJsonl, readJsonl } from './transport/jsonl.js';
export { isEnvelope, collectEnvelopes, A2UI_MIME_TYPE } from './transport/envelope.js';
export { connectSSE } from './transport/sse.js';
export { connectWebSocket } from './transport/websocket.js';
export { fromA2A, toA2APart, toA2AMessage, A2A_EXTENSION_URI, A2A_EXTENSION_HEADER } from './transport/a2a.js';
export { fromAgUiEvent, connectAgUi } from './transport/agui.js';
export { renderToHTML, renderToDocument } from './static/index.js';

export const VERSION = '0.9.0';
