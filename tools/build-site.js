// Assemble the GitHub Pages site into _site/.
//   npm run build && node tools/build-site.js
// The site keeps repository-relative paths, so pages work the same when served from a
// checkout (npm run pages) and from GitHub Pages.
import { cpSync, mkdirSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '_site');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const copy = (from, to = from) => cpSync(path.join(root, from), path.join(out, to), { recursive: true });

copy('index.html');
copy('pages');
copy('docs');
copy('examples');
copy('dist');
copy('test/upstream/examples');
copy('LICENSE');
copy('NOTICE');
writeFileSync(path.join(out, '.nojekyll'), '');

// sitemap for the static pages
const base = 'https://deftio.github.io/bitwrench-a2ui/';
const pages = readdirSync(path.join(root, 'pages')).filter(f => f.endsWith('.html'));
const docs = readdirSync(path.join(root, 'docs')).filter(f => f.endsWith('.md')).map(f => `pages/docs.html?doc=${f.replace(/\.md$/, '')}`);
const urls = [...pages.map(p => `pages/${p}`), ...docs].map(u => `  <url><loc>${base}${u.replace(/&/g, '&amp;')}</loc></url>`).join('\n');
writeFileSync(path.join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
writeFileSync(path.join(out, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${base}sitemap.xml\n`);
console.log(`site assembled in ${path.relative(root, out)}/`);
