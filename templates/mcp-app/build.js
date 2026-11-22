// Build a single-file MCP App (ui:// resource) that renders A2UI.
//
//   npm run build
//   node templates/mcp-app/build.js [messages.json] [--title "My app"] [--theme ocean]
//                                   [--host-origin https://host.example] > app.html
//
// messages.json may hold one A2UI envelope, an array, or {messages:[...]}. The output
// inlines dist/bitwrench-a2ui.bundle.min.js (bitwrench + bitwrench-a2ui) and the messages
// into template.html, so the page needs no network access.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const title = flag('--title') ?? 'A2UI surface';
const theme = flag('--theme') ?? 'teal';
const hostOrigin = flag('--host-origin') ?? null;
if (hostOrigin !== null && new URL(hostOrigin).origin !== hostOrigin) { console.error(`--host-origin must be an origin such as https://host.example, not ${hostOrigin}`); process.exit(1); }
const file = args[0];

const bundlePath = path.join(root, 'dist/bitwrench-a2ui.bundle.min.js');
if (!existsSync(bundlePath)) { console.error('dist/bitwrench-a2ui.bundle.min.js not found: run npm run build first'); process.exit(1); }

let messages = [];
if (file) {
  const v = JSON.parse(readFileSync(path.resolve(file), 'utf8'));
  messages = Array.isArray(v) ? v : Array.isArray(v.messages) ? v.messages : [v];
}

// JSON and scripts inside <script>: neutralize "</script" and HTML comment openers.
const inlineSafe = s => s.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
const escapeHtml = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const html = readFileSync(path.join(here, 'template.html'), 'utf8')
  .replace('{{TITLE}}', () => escapeHtml(title))
  .replace('{{BUNDLE}}', () => inlineSafe(readFileSync(bundlePath, 'utf8')))
  .replace('{{MESSAGES}}', () => inlineSafe(JSON.stringify(messages)))
  .replace('{{THEME}}', () => JSON.stringify(theme))
  .replace('{{HOST_ORIGIN}}', () => inlineSafe(JSON.stringify(hostOrigin)));
process.stdout.write(html);
