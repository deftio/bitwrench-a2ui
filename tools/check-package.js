// Check the npm package before it is published.
//
//   node tools/check-package.js            contents, exports and version consistency
//   node tools/check-package.js --install  also installs the packed tarball into an
//                                          empty project and renders with it
//
// Run after `npm run build`. CI and the release workflow run it with --install.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); };

// 1. Contents of the tarball, as npm would pack it.
const [packed] = JSON.parse(execFileSync(npm, ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root, encoding: 'utf8' }));
const files = new Set(packed.files.map(f => f.path));
const REQUIRED = [
  'package.json', 'README.md', 'LICENSE', 'NOTICE', 'SECURITY.md', 'CHANGELOG.md',
  'src/index.js', 'src/static/index.js', 'src/catalog/basic/catalog-json.js',
  'dist/bitwrench-a2ui.js', 'dist/bitwrench-a2ui.min.js', 'dist/bitwrench-a2ui.esm.min.js',
  'dist/bitwrench-a2ui.bundle.min.js', 'dist/builds.json', 'dist/THIRD_PARTY_LICENSES',
  'templates/mcp-app/build.js', 'templates/mcp-app/template.html',
];
for (const f of REQUIRED) check(files.has(f), `missing from the package: ${f}`);
const FORBIDDEN = /^(test|tmp|dev|coverage|pages|docs|examples|tools|_site|node_modules|\.github|\.claude)\/|^\.env|\.pem$|\.key$/;
for (const f of files) check(!FORBIDDEN.test(f), `should not be in the package: ${f}`);
check(packed.unpackedSize < 8 * 1024 * 1024, `unpacked size ${packed.unpackedSize} bytes is over 8 MB`);

// 2. Every exports target exists in the tarball (wildcards: the directory has files).
for (const [key, target] of Object.entries(pkg.exports)) {
  const t = target.replace(/^\.\//, '');
  check(t.includes('*') ? [...files].some(f => f.startsWith(t.split('*')[0])) : files.has(t), `exports["${key}"] -> ${target} is not in the package`);
}

// 3. One version everywhere.
const v = pkg.version;
const srcVersion = /export const VERSION = "([^"]+)"/.exec(readFileSync(path.join(root, 'src/version.js'), 'utf8'))?.[1];
check(srcVersion === v, `src/version.js VERSION is ${srcVersion}, package.json is ${v}: run npm run build`);
const builds = JSON.parse(readFileSync(path.join(root, 'dist/builds.json'), 'utf8'));
check(builds.version === v, `dist/builds.json is for ${builds.version}, package.json is ${v}: rebuild`);
for (const f of ['bitwrench-a2ui.min.js', 'bitwrench-a2ui.esm.min.js', 'bitwrench-a2ui.bundle.min.js']) {
  const head = readFileSync(path.join(root, 'dist', f), 'utf8');   // the bundle starts with bitwrench's banner
  check(head.includes(`bitwrench-a2ui v${v} `), `dist/${f} banner is not v${v}: rebuild`);
}
check(/^## (Unreleased|\d)/m.test(readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')), 'CHANGELOG.md has no release sections');

// 4. Optional: install the real tarball in an empty project and use it.
if (process.argv.includes('--install') && problems.length === 0) {
  const dir = mkdtempSync(path.join(tmpdir(), 'bwa2ui-pack-'));
  try {
    const [{ filename }] = JSON.parse(execFileSync(npm, ['pack', '--json', '--ignore-scripts', '--pack-destination', dir], { cwd: root, encoding: 'utf8' }));
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'pack-check', private: true, type: 'module' }));
    execFileSync(npm, ['install', '--ignore-scripts', '--no-audit', '--no-fund', path.join(dir, filename)], { cwd: dir, stdio: 'inherit' });
    writeFileSync(path.join(dir, 'smoke.js'), `
import { renderToHTML } from 'bitwrench-a2ui/static';
import { parseJsonl } from 'bitwrench-a2ui/transport/jsonl';
import { VERSION } from 'bitwrench-a2ui';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { html, errors } = renderToHTML(parseJsonl(JSON.stringify({ version: '1.0', createSurface: { surfaceId: 's',
  catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
  components: [{ id: 'root', component: 'Text', text: 'packed ok' }] } })));
if (errors.length || !html.includes('packed ok')) throw new Error('render failed: ' + JSON.stringify(errors));
if (VERSION !== ${JSON.stringify(v)}) throw new Error('VERSION ' + VERSION);
readFileSync(require.resolve('bitwrench-a2ui/dist/bitwrench-a2ui.min.js'));
console.log('installed tarball renders: ok');
`);
    execFileSync(process.execPath, ['smoke.js'], { cwd: dir, stdio: 'inherit' });
  } catch (e) {
    problems.push(`installing the packed tarball failed: ${e.message}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (problems.length) {
  console.error(`package check failed:\n${problems.map(p => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`package check ok: ${pkg.name}@${v}, ${files.size} files, ${(packed.size / 1024).toFixed(0)} KB packed`);
