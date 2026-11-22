// Point every page at the pinned CDN builds of bitwrench and quikdown, with SRI.
//
//   node tools/cdn-tags.js          rewrite pages/*.html and examples/*.html
//   node tools/cdn-tags.js --check  exit 1 if any tag is local, unpinned or has a wrong hash
//
// Versions come from package.json (exact pins) and the integrity hashes from the files in
// node_modules, which are byte-identical to what jsDelivr serves for that version. Run it
// after upgrading either dependency. bitwrench-a2ui itself stays a local ../dist file on
// the site, so the site always demonstrates the build in this checkout.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pins = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).dependencies;
const CDN_PACKAGES = ['bitwrench', 'quikdown'];

export function cdnAttrs(pkg, file) {
  const version = pins[pkg];
  const local = path.join(root, 'node_modules', pkg, 'dist', file);
  const integrity = `sha384-${createHash('sha384').update(readFileSync(local)).digest('base64')}`;
  return `src="https://cdn.jsdelivr.net/npm/${pkg}@${version}/dist/${file}" integrity="${integrity}" crossorigin="anonymous"`;
}

// The src attribute (and any integrity/crossorigin after it) of a local node_modules or CDN
// reference to these packages. Only attribute values are matched, never whole tags.
const SRC = new RegExp(String.raw`src="(?:(?:\.\.)?/node_modules/|https://cdn\.jsdelivr\.net/npm/)(${CDN_PACKAGES.join('|')})(?:@[^/"]+)?/dist/([\w.-]+\.js)"(?:\s+integrity="[^"]*")?(?:\s+crossorigin="[^"]*")?`, 'g');

export function pageFiles() {
  return ['pages', 'examples'].flatMap(d => readdirSync(path.join(root, d)).filter(f => f.endsWith('.html')).map(f => path.join(d, f)));
}

const check = process.argv.includes('--check');
let changed = 0;
const stale = [];
for (const rel of pageFiles()) {
  const file = path.join(root, rel);
  const html = readFileSync(file, 'utf8');
  const next = html.replace(SRC, (_, pkg, f) => cdnAttrs(pkg, f));
  if (next !== html) {
    if (check) stale.push(rel);
    else { writeFileSync(file, next); changed++; }
  }
}
if (check) {
  if (stale.length) { console.error(`CDN tags out of date in: ${stale.join(', ')}\nrun node tools/cdn-tags.js`); process.exit(1); }
  console.log('CDN tags ok');
} else {
  console.log(`updated ${changed} file(s)`);
}
