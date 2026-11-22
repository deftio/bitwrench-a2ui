// Markdown for the Text component: quikdown parses to an AST, and we build TACO from an
// allowlist of node types. Nothing is ever turned into an HTML string, so there is
// nothing to sanitize: raw HTML arrives from quikdown as text and stays text, links and
// images render as their text, and unknown node types fall back to their text content.
//
// The supported subset follows the A2UI basic catalog guidance and the conformance
// suite conformance/adapter/markdown_subset.yaml: emphasis, strong, headings, lists,
// inline code, code blocks, paragraphs and line breaks.
import quikdownAst from 'quikdown/ast';

const MAX_DEPTH = 32;

/** Plain text of any AST node (used for unknown types and over-deep nesting). */
function textOf(node) {
  if (!node || typeof node !== 'object') return '';
  if (typeof node.value === 'string') return node.value;
  if (typeof node.content === 'string') return node.content;
  if (node.type === 'image') return String(node.alt ?? '');
  if (Array.isArray(node.rows)) {
    // Tables are outside the A2UI Markdown subset: keep their text, one row per line.
    const cells = row => [].concat(row).map(cell => [].concat(cell).map(textOf).join(''));
    return [node.headers, ...node.rows].filter(Boolean).map(r => cells(r).join(' | ')).join('\n');
  }
  return [].concat(node.children ?? node.items ?? []).map(textOf).join('');
}

function inline(nodes, depth) {
  const out = [];
  for (const n of [].concat(nodes ?? [])) {
    const t = convert(n, depth + 1);
    if (Array.isArray(t)) out.push(...t);
    else if (t !== null && t !== '') out.push(t);
  }
  return out;
}

function convert(node, depth) {
  if (!node || typeof node !== 'object') return null;
  if (depth > MAX_DEPTH) return textOf(node);
  const kids = () => inline(node.children, depth);
  switch (node.type) {
    case 'text': return String(node.value ?? '');
    case 'em': return { t: 'em', c: kids() };
    case 'strong': return { t: 'strong', c: kids() };
    case 'del': return { t: 'del', c: kids() };
    case 'code': return { t: 'code', a: { class: 'a2ui-md-code' }, c: String(node.value ?? '') };
    case 'br': return { t: 'br' };
    case 'link': return kids();                             // text only, no target
    case 'image': return textOf(node);                       // alt text only, never an <img>
    case 'paragraph': return { t: 'p', a: { class: 'a2ui-md-p' }, c: kids() };
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.level) || 1));
      return { t: `h${level}`, a: { class: 'a2ui-md-h' }, c: kids() };
    }
    case 'list': return {
      t: node.ordered ? 'ol' : 'ul', a: { class: 'a2ui-md-list' },
      c: [].concat(node.items ?? []).map(item => ({ t: 'li', c: inline(item?.children, depth) })),
    };
    case 'list_item': return { t: 'li', c: kids() };
    case 'code_block': return { t: 'pre', a: { class: 'a2ui-md-pre' }, c: { t: 'code', c: textOf(node) } };
    case 'blockquote': return { t: 'blockquote', a: { class: 'a2ui-md-quote' }, c: kids() };
    case 'hr': return { t: 'hr' };
    default: return textOf(node) || null;
  }
}

/**
 * Convert a quikdown AST to TACO content.
 * @returns {{content: Array, block: boolean}} `block` is false when the result is a
 *   single paragraph, so callers can render it inline (for example inside a Button).
 */
export function astToTaco(ast) {
  const blocks = [].concat(ast?.children ?? []).map(n => convert(n, 0)).filter(x => x !== null && x !== '');
  if (blocks.length === 1 && blocks[0].t === 'p') return { content: blocks[0].c, block: false };
  return { content: blocks, block: blocks.length > 0 };
}

/**
 * Convert Markdown to TACO content.
 * @param {string} md
 * @param {(md: string) => object} [parse]  Markdown parser returning a quikdown-style AST
 */
export function markdownToTaco(md, parse = quikdownAst) {
  const source = typeof md === 'string' ? md : String(md ?? '');
  if (source === '') return { content: [], block: false };
  try {
    return astToTaco(parse(source));
  } catch {
    return { content: [source], block: false };       // never fail a render on bad Markdown
  }
}
