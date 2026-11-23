// Minimal static server for working on the site locally.
//   npm run pages        then open http://localhost:8080/pages/
// Serves the repository root, so pages load ../dist, ../docs and ../test/upstream/examples
// exactly as they do on GitHub Pages (see build-site.js).
// bitwrench and quikdown load from jsDelivr (pinned, with SRI; see tools/cdn-tags.js).
import http from 'node:http';
import { open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8080);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4', '.mp3': 'audio/mpeg',
};

// Map a URL path to a file inside base, or null. Decodes once, normalizes, then checks the
// result is really under base (a plain startsWith would accept a sibling such as base-other).
function resolveInside(base, urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch { return null; }   // malformed %-escapes
  if (decoded.includes('\0')) return null;
  const full = path.resolve(base, '.' + path.posix.normalize('/' + decoded));
  const rel = path.relative(base, full);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return rel === '' ? full : null;
  // No dotfiles or dot-directories (.git, .env, .claude ...).
  if (rel.split(path.sep).some(part => part.startsWith('.'))) return null;
  return full;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let file = resolveInside(root, url.pathname);
  if (!file) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return; }
  // Check and read through one open file handle, so the file cannot change in between.
  let handle;
  try {
    handle = await open(file);
    if ((await handle.stat()).isDirectory()) {
      await handle.close();
      file = path.join(file, 'index.html');
      handle = await open(file);
    }
    const data = await handle.readFile();
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  } finally {
    await handle?.close().catch(() => {});
  }
}).listen(port, () => console.log(`serving ${root} at http://localhost:${port}/pages/`));
