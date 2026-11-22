// Build the browser distributions with esbuild.
//
//   node build.js
//
// npm users import the ESM source in src/ directly (package.json "exports"), so no
// build is needed there. dist/ is for browsers without a bundler:
//
//   dist/bitwrench-a2ui.min.js         <script> build, global `bwA2UI`; load bitwrench first
//   dist/bitwrench-a2ui.js             same, unminified
//   dist/bitwrench-a2ui.esm.min.js     ES module for browsers; uses the global `bw`
//   dist/bitwrench-a2ui.bundle.min.js  single file: bitwrench + bitwrench-a2ui (MCP Apps, offline)
//   dist/builds.json                   sizes, SRI hashes, pinned versions, bundle checks
//   dist/THIRD_PARTY_LICENSES          licenses of the code bundled into dist files
//
// @a2ui/web_core and quikdown are bundled into the dist files. bitwrench is not (except
// in the .bundle file), so pages load the pinned, published bitwrench file unchanged.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname);
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
// src/version.js is generated from package.json, the single source of truth.
execFileSync(process.execPath, [path.join(root, 'tools/gen-version.js')], { stdio: 'inherit' });
const dep = name => JSON.parse(readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8'));
const dist = path.join(root, 'dist');
mkdirSync(dist, { recursive: true });

const banner = `/*! bitwrench-a2ui v${pkg.version} | Apache-2.0 | https://github.com/deftio/bitwrench-a2ui
 *  Bundles @a2ui/web_core ${dep('@a2ui/web_core').version} (Apache-2.0, Google LLC) and quikdown ${dep('quikdown').version} (BSD-2-Clause).
 *  Requires bitwrench ${dep('bitwrench').version} (BSD-2-Clause), loaded separately. See THIRD_PARTY_LICENSES. */`;

// bitwrench comes from the page (window.bw), loaded from its own published file.
const bitwrenchGlobal = {
  name: 'bitwrench-global',
  setup(b) {
    b.onResolve({ filter: /^bitwrench$/ }, () => ({ path: 'bitwrench', namespace: 'bw-global' }));
    b.onLoad({ filter: /.*/, namespace: 'bw-global' }, () => ({
      contents: `const bw = globalThis.bw;
if (!bw) throw new Error('bitwrench-a2ui: load bitwrench (bitwrench.umd.min.js) before bitwrench-a2ui');
export default bw;`,
      loader: 'js',
    }));
  },
};

const common = {
  entryPoints: [path.join(root, 'src/browser.js')],
  bundle: true,
  platform: 'browser',
  target: ['es2020'],
  plugins: [bitwrenchGlobal],
  banner: { js: banner },
  legalComments: 'none',
  metafile: true,
  logLevel: 'warning',
};

const outputs = [
  { file: 'bitwrench-a2ui.js', opts: { format: 'iife', globalName: 'bwA2UI', minify: false } },
  { file: 'bitwrench-a2ui.min.js', opts: { format: 'iife', globalName: 'bwA2UI', minify: true } },
  { file: 'bitwrench-a2ui.esm.min.js', opts: { format: 'esm', minify: true } },
];

const report = {
  name: pkg.name,
  version: pkg.version,
  built: new Date().toISOString(),
  pins: {
    bitwrench: dep('bitwrench').version,
    '@a2ui/web_core': dep('@a2ui/web_core').version,
    quikdown: dep('quikdown').version,
    a2uiSpecCommit: readFileSync(path.join(root, 'test/upstream/PINNED_COMMIT'), 'utf8').trim(),
  },
  files: {},
  checks: {},
};

const bundledPackages = new Set();
const pkgOf = p => { const m = p.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/); return m ? m[1] : null; };

for (const o of outputs) {
  const res = await build({ ...common, ...o.opts, outfile: path.join(dist, o.file) });
  const inputs = Object.values(res.metafile.outputs)[0].inputs;
  const emitted = Object.entries(inputs).filter(([, v]) => v.bytesInOutput > 0).map(([p]) => p);
  for (const p of emitted) { const name = pkgOf(p); if (name) bundledPackages.add(name); }
  const lit = emitted.filter(p => /node_modules\/(lit|lit-html|lit-element|@lit)\//.test(p) || p.includes('web_core/src/universal/'));
  report.checks[o.file] = { litModules: lit.length, universalLayerModules: lit.filter(p => p.includes('universal')).length };
  if (lit.length) throw new Error(`${o.file}: Lit or web_core's Lit layer was bundled:\n  ${lit.join('\n  ')}`);
}

// Single file: the published bitwrench UMD, unchanged, followed by the IIFE build.
const bwFile = path.join(root, 'node_modules/bitwrench/dist/bitwrench.umd.min.js');
const bundle = `${readFileSync(bwFile, 'utf8').trim()}\n${readFileSync(path.join(dist, 'bitwrench-a2ui.min.js'), 'utf8')}`;
writeFileSync(path.join(dist, 'bitwrench-a2ui.bundle.min.js'), bundle);

for (const f of readdirSync(dist).filter(f => f.endsWith('.js'))) {
  const buf = readFileSync(path.join(dist, f));
  report.files[f] = {
    bytes: buf.length,
    gzip: gzipSync(buf, { level: 9 }).length,
    brotli: brotliCompressSync(buf).length,
    integrity: `sha384-${createHash('sha384').update(buf).digest('base64')}`,
  };
}
report.files['bitwrench.umd.min.js (pinned, loaded separately)'] = (() => {
  const buf = readFileSync(bwFile);
  return { bytes: buf.length, gzip: gzipSync(buf, { level: 9 }).length, integrity: `sha384-${createHash('sha384').update(buf).digest('base64')}` };
})();
report.bundledPackages = [...bundledPackages].sort();

// Third-party licenses for everything bundled (plus bitwrench, which the .bundle file includes).
const licenseText = name => {
  const dir = path.join(root, 'node_modules', name);
  const f = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'LICENCE'].map(n => path.join(dir, n)).find(existsSync);
  const meta = dep(name);
  return `== ${name}@${meta.version} (${meta.license ?? 'see file'}) ==\n${f ? readFileSync(f, 'utf8').trim() : `License: ${meta.license}. No license file shipped in the package.`}`;
};
const names = [...new Set([...bundledPackages, 'bitwrench'])].sort();
writeFileSync(path.join(dist, 'THIRD_PARTY_LICENSES'), `Third-party code included in bitwrench-a2ui dist files.\n\n${names.map(licenseText).join('\n\n')}\n`);
writeFileSync(path.join(dist, 'builds.json'), `${JSON.stringify(report, null, 2)}\n`);

const kb = n => `${(n / 1024).toFixed(1)} KB`;
for (const [f, r] of Object.entries(report.files)) console.log(`${f.padEnd(52)} ${kb(r.bytes).padStart(9)}  gzip ${kb(r.gzip).padStart(8)}`);
console.log(`bundled: ${report.bundledPackages.join(', ')}`);
