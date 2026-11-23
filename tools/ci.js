#!/usr/bin/env node
// The CI checks, defined once. .github/workflows/ci.yml runs each job through this
// script, and the release script runs all of it on the release commit, so a release
// passes locally exactly what it must pass on GitHub.
//
//   npm run ci                     every job
//   node tools/ci.js --job test    one job: test | package
//
// Run it on committed work: two checks compare generated files with what is committed.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const node = process.execPath;

// Each step: [label, command, args, hint shown when it fails].
export const JOBS = {
  test: [
    ['src/version.js matches package.json', node, ['tools/gen-version.js', '--check']],
    ['build', npm, ['run', 'build']],
    // dist/ is committed so CDN users and the site get exactly what CI built. Only the
    // build timestamp in builds.json may differ.
    ['committed dist/ matches a fresh build', 'git', ['diff', '--exit-code', '-I', '"built":', '--', 'dist/'], 'dist/ is stale: run npm run build and commit it'],
    ['CDN script tags carry the pinned versions and SRI', node, ['tools/cdn-tags.js', '--check']],
    ['tests with the 100% coverage gate', npm, ['run', 'test:coverage']],
    ['conformance report', npm, ['run', 'conformance:report']],
    ['conformance report is current', 'git', ['diff', '--exit-code', '-I', '^\\* \\*\\*Generated\\*\\*', '--', 'docs/conformance-report.md'], 'docs/conformance-report.md is stale: run npm run conformance:report and commit it'],
  ],
  package: [
    ['build', npm, ['run', 'build']],
    ['package contents, exports, versions, and a real install of the tarball', node, ['tools/check-package.js', '--install']],
    ['registry signatures and provenance of installed dependencies', npm, ['audit', 'signatures']],
    // Runtime dependencies are what users install. Dev dependencies are covered by
    // Dependabot alerts and by dependency review on pull requests.
    ['known vulnerabilities in runtime dependencies (reviewed allowlist)', node, ['tools/audit.js']],
    ['site builds', node, ['tools/build-site.js']],
  ],
};

export function run(jobs = Object.keys(JOBS), { cwd = root, log = console.log } = {}) {
  for (const job of jobs) {
    if (!JOBS[job]) throw new Error(`unknown job "${job}": use ${Object.keys(JOBS).join(' or ')}`);
    for (const [label, cmd, args, hint] of JOBS[job]) {
      log(`\n▶ ${job}: ${label}\n  $ ${path.basename(cmd)} ${args.join(' ')}`);
      try {
        execFileSync(cmd, args, { cwd, stdio: 'inherit' });
      } catch {
        throw new Error(`${job}: ${label} failed${hint ? `: ${hint}` : ''}`);
      }
    }
  }
  log(`\n✓ CI passed (${jobs.join(', ')})`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const i = process.argv.indexOf('--job');
  try {
    run(i > 0 ? [process.argv[i + 1]] : undefined);
  } catch (e) {
    console.error(`\n::error::${e.message}`);
    process.exit(1);
  }
}
