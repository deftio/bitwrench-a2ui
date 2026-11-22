import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { safeMediaUrl, isHttpUrl, isSafeColor, safeSvgPath } from '../../src/render/safety.js';
import { markdownToTaco, astToTaco } from '../../src/render/markdown.js';
import { isNode, val, isWritable, str, childNodes } from '../../src/core/interface.js';

describe('media URL policy', () => {
  it('allows http(s), data and relative URLs', () => {
    assert.equal(safeMediaUrl('https://a.example/x.png'), 'https://a.example/x.png');
    assert.equal(safeMediaUrl('  http://a.example/x  '), 'http://a.example/x');
    assert.equal(safeMediaUrl('data:image/png;base64,AAA'), 'data:image/png;base64,AAA');
    assert.equal(safeMediaUrl('img/a.png'), 'img/a.png');
    assert.equal(safeMediaUrl('/img/a.png'), '/img/a.png');
  });

  it('rejects everything else', () => {
    for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', 'vbscript:x', 'file:///etc/passwd',
      '//evil.example/x', '\\\\evil.example\\x', 'https:/evil', 'https:', '', '   ', null, 42]) {
      assert.equal(safeMediaUrl(bad), '', String(bad));
    }
    assert.equal(safeMediaUrl('data:x', { allowData: false }), '');
  });

  it('openUrl accepts absolute http(s) only', () => {
    assert.ok(isHttpUrl('https://a.example'));
    assert.ok(isHttpUrl(' http://a.example/x'));
    assert.ok(!isHttpUrl('javascript:alert(1)'));
    assert.ok(!isHttpUrl('/relative'));
    assert.ok(!isHttpUrl(undefined));
  });

  it('colors and svg paths', () => {
    for (const c of ['#fff', '#ffffff', '#ffff', '#ffffffff', 'rgb(1, 2, 3)', 'rgba(1,2,3,0.5)', 'rgba(1,2,3,1)']) assert.ok(isSafeColor(c), c);
    for (const c of ['red;x', 'url(x)', '#ggg', 'rgb(1,2)', 3, 'expression(x)']) assert.ok(!isSafeColor(c), String(c));
    assert.equal(safeSvgPath('M10 10 L20 20 Z'), 'M10 10 L20 20 Z');
    assert.equal(safeSvgPath('M0 0"/><script>'), '');
    assert.equal(safeSvgPath(5), '');
    assert.equal(safeSvgPath('M'.repeat(20001)), '');
  });
});

describe('markdown to TACO', () => {
  const flat = x => JSON.stringify(x);
  it('single paragraphs render inline', () => {
    const r = markdownToTaco('a *b* **c** ~~d~~ `e`');
    assert.equal(r.block, false);
    assert.ok(flat(r.content).includes('"t":"em"'));
    assert.ok(flat(r.content).includes('"t":"strong"'));
    assert.ok(flat(r.content).includes('"t":"code"'));
  });

  it('blocks: headings, lists, code blocks, quotes, rules', () => {
    const r = markdownToTaco('# H\n\n1. one\n2. two\n\n- x\n\n```\ncode\n```\n\n> quote\n\n---\n\npara  \nbreak');
    assert.equal(r.block, true);
    const s = flat(r.content);
    for (const t of ['"t":"h1"', '"t":"ol"', '"t":"ul"', '"t":"pre"', '"t":"blockquote"', '"t":"hr"']) assert.ok(s.includes(t), t);
  });

  it('links and images become text, raw HTML stays text', () => {
    const s = flat(markdownToTaco('[a](https://x) ![b](https://y) <b>c</b>').content);
    assert.ok(!s.includes('"t":"a"') && !s.includes('"t":"img"') && !s.includes('"t":"b"'));
    assert.ok(s.includes('<b>c</b>'));
  });

  it('empty, non-string and unknown nodes', () => {
    assert.deepEqual(markdownToTaco(''), { content: [], block: false });
    assert.equal(markdownToTaco(42).content[0], '42');
    assert.equal(markdownToTaco(undefined).content.length, 0);
  });

  it('deep nesting is cut off at a safe depth', () => {
    const deep = `${'> '.repeat(60)}x`;
    const r = markdownToTaco(deep);
    assert.ok(flat(r.content).includes('x'));
  });

  it('a throwing parser falls back to plain text', () => {
    assert.deepEqual(markdownToTaco('**x**', () => { throw new Error('bad'); }), { content: ['**x**'], block: false });
  });

  it('odd and partial AST nodes are handled defensively', () => {
    const r = astToTaco({ children: [
      null, 'str',
      { type: 'text' }, { type: 'code' },
      { type: 'heading', level: 'x', children: [{ type: 'text', value: 'h' }] },
      { type: 'heading', level: 9, children: [] },
      { type: 'list', items: [null, { children: [{ type: 'text', value: 'li' }] }] },
      { type: 'list' },
      { type: 'list_item', children: [{ type: 'text', value: 'loose' }] },
      { type: 'code_block' },
      { type: 'image' },
      { type: 'table', headers: null, rows: [[['a'], { type: 'text', value: 'b' }], null] },
      { type: 'mystery', content: 'kept' },
      { type: 'mystery' },
      { type: 'paragraph', children: [{ type: 'text', value: '' }, { type: 'link', children: [{ type: 'text', value: 'L' }] }] },
    ] });
    const s = JSON.stringify(r.content);
    for (const t of ['"t":"h1"', '"t":"h6"', 'li', 'loose', 'kept', 'L']) assert.ok(s.includes(t), t);
    assert.deepEqual(astToTaco(null), { content: [], block: false });
    assert.deepEqual(astToTaco({ children: [{ type: 'text', value: 'just text' }] }), { content: ['just text'], block: true });
  });

  it('table and task-list items fall back to text', () => {
    const r = markdownToTaco('| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done');
    const s = flat(r.content);
    assert.ok(s.includes('1') && s.includes('done'));
  });
});

describe('interface helpers', () => {
  const node = { instanceId: 'i' };
  it('recognize nodes, bindings and literals', () => {
    assert.ok(isNode(node));
    assert.ok(!isNode({}));
    assert.equal(val({ value: 3 }), 3);
    assert.equal(val(node), node);
    assert.equal(val([1]).length, 1);
    assert.ok(isWritable({ value: 1, set() {} }));
    assert.ok(!isWritable(null));
    assert.equal(str({ value: null }), '');
    assert.equal(str({ value: { a: 1 } }), '{"a":1}');
    assert.equal(str(7), '7');
    assert.deepEqual(childNodes(node), [node]);
    assert.deepEqual(childNodes([node, 1]), [node]);
    assert.deepEqual(childNodes('x'), []);
  });
});
