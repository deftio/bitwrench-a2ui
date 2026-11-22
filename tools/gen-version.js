// Write src/version.js from package.json, the single source of truth for the version.
//   node tools/gen-version.js          (npm run build runs it first)
//   node tools/gen-version.js --check  exit 1 if src/version.js is out of date
//
// A generated module, rather than importing package.json at runtime, keeps src/ loadable as
// plain ES modules everywhere: browsers without JSON-module support, every bundler, Node.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'src/version.js');

export function versionModule(version) {
  return `// Generated from package.json by tools/gen-version.js. Do not edit: change the version in
// package.json (npm run release does this) and run npm run build.

/** The bitwrench-a2ui package version, e.g. '${version}'. */
export const VERSION = ${JSON.stringify(version)};

/** The bitwrench-a2ui package version. Same as VERSION. */
export function getVersion() {
  return VERSION;
}
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const want = versionModule(version);
  let have = '';
  try { have = readFileSync(file, 'utf8'); } catch { /* first run */ }
  if (process.argv.includes('--check')) {
    if (have !== want) { console.error(`src/version.js is not ${version}: run node tools/gen-version.js`); process.exit(1); }
    console.log(`src/version.js ok (${version})`);
  } else if (have !== want) {
    writeFileSync(file, want);
    console.log(`src/version.js -> ${version}`);
  }
}
