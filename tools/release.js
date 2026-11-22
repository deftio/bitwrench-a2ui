#!/usr/bin/env node
// Prepare, verify and tag a release. Publishing is done by CI, never from a laptop.
//
//   npm run release -- patch|minor|major        0.1.0 -> 0.1.1 / 0.2.0 / 1.0.0
//   npm run release -- 0.2.0-rc.1               an explicit version (pre-releases go to "next")
//   npm run release -- minor --dry-run          every check and gate, no changes kept
//   npm run release -- minor --yes              no prompts (for scripted use)
//
// Steps (stops at the first failure; see RELEASE.md):
//   1. Pre-flight   on main, clean, in sync with origin, right git identity, version free on
//                   npm and as a tag, CHANGELOG "Unreleased" has content, package not private
//   2. Bump         package.json, package-lock.json, src/index.js VERSION, CDN URLs in docs
//                   and examples, CHANGELOG "Unreleased" -> "## X.Y.Z - date"
//   3. Gates        build, CDN tag check, tests with the 100% coverage gate, conformance
//                   report, package check with a real install, site build
//   4. Commit + tag "release: vX.Y.Z" and an annotated tag vX.Y.Z (signed if git has a key)
//   5. Push         main and the tag, atomically. The tag push starts .github/workflows/release.yml,
//                   which publishes to npm (OIDC, provenance) and creates the GitHub Release.
//
// Each of steps 4 and 5 asks first. If a gate fails after the bump, the script offers to
// restore the working tree to HEAD.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run') || args.includes('-n');
const YES = args.includes('--yes') || args.includes('-y');
const target = args.find(a => !a.startsWith('-'));

// The GitHub owner, and the git user.name, that may publish this package. Commits under
// another identity are an IP problem for the maintainer, so the script refuses them.
const OWNER = 'deftio';
const BRANCH = 'main';

// ---- helpers -------------------------------------------------------------------------
const read = rel => readFileSync(path.join(root, rel), 'utf8');
const write = (rel, s) => writeFileSync(path.join(root, rel), s);
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
const tryGit = (...a) => { try { return git(...a); } catch { return null; } };
function run(cmd, cmdArgs) {
  console.log(`\n  $ ${cmd} ${cmdArgs.join(' ')}`);
  execFileSync(cmd, cmdArgs, { cwd: root, stdio: 'inherit' });
}
function step(n, label) { console.log(`\n${'─'.repeat(64)}\n ${n}. ${label}${DRY ? '   (dry run)' : ''}\n${'─'.repeat(64)}`); }
function fail(msg) { console.error(`\n✗ release stopped: ${msg}\n`); process.exit(1); }
const ok = msg => console.log(`  ✓ ${msg}`);
const warn = msg => console.log(`  ! ${msg}`);
async function confirm(question) {
  if (YES) return true;
  if (!process.stdin.isTTY) fail(`"${question}" needs an answer: run in a terminal or pass --yes`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`\n  ${question} [y/N] `)).trim().toLowerCase();
  rl.close();
  return answer === 'y' || answer === 'yes';
}

// ---- semver ----------------------------------------------------------------------------
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
export function nextVersion(current, spec) {
  const m = SEMVER.exec(current);
  if (!m) throw new Error(`current version ${current} is not semver`);
  const [maj, min, pat] = m.slice(1, 4).map(Number);
  const pre = m[4];
  if (spec === 'patch') return pre ? `${maj}.${min}.${pat}` : `${maj}.${min}.${pat + 1}`;
  if (spec === 'minor') return `${maj}.${min + 1}.0`;
  if (spec === 'major') return `${maj + 1}.0.0`;
  if (!SEMVER.test(spec)) throw new Error(`"${spec}" is not patch, minor, major or a version like 1.2.3 / 1.2.3-rc.1`);
  return spec;
}
export function compareVersions(a, b) {
  const pa = SEMVER.exec(a), pb = SEMVER.exec(b);
  for (let i = 1; i <= 3; i++) if (+pa[i] !== +pb[i]) return +pa[i] - +pb[i];
  if (pa[4] === pb[4]) return 0;
  if (!pa[4]) return 1;
  if (!pb[4]) return -1;
  return pa[4] < pb[4] ? -1 : 1;
}

// ---- file edits ------------------------------------------------------------------------
// Files that may carry the CDN URL of this package: bumped to the new version.
function cdnFiles() {
  const list = (dir, ext) => execFileSync('git', ['ls-files', dir], { cwd: root, encoding: 'utf8' }).split('\n').filter(f => f.endsWith(ext));
  return ['README.md', 'llms.txt', ...list('docs', '.md'), ...list('examples', '.html'), ...list('pages', '.html')];
}
export function bumpCdn(text, version) {
  return text.replace(/(cdn\.jsdelivr\.net\/npm\/bitwrench-a2ui@)\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/g, `$1${version}`);
}
export function promoteChangelog(text, version, date) {
  const m = /^## Unreleased\s*\n([\s\S]*?)(?=^## )/m.exec(text);
  if (!m) throw new Error('CHANGELOG.md has no "## Unreleased" section followed by a release');
  const body = m[1].trim();
  if (!body || /^nothing yet\.?$/i.test(body)) throw new Error('CHANGELOG.md "Unreleased" is empty: describe the release first');
  return text.replace(m[0], `## Unreleased\n\nNothing yet.\n\n## ${version} - ${date}\n\n${body}\n\n`);
}

// ---- main ------------------------------------------------------------------------------
async function main() {
  if (!target) fail('say which version: npm run release -- patch|minor|major|X.Y.Z [--dry-run]');
  const pkg = JSON.parse(read('package.json'));
  const from = pkg.version;
  let version;
  try { version = nextVersion(from, target); } catch (e) { fail(e.message); }
  if (compareVersions(version, from) <= 0) fail(`${version} is not newer than ${from}`);
  const tag = `v${version}`;
  const prerelease = version.includes('-');
  console.log(`\nbitwrench-a2ui ${from} -> ${version}${prerelease ? ' (pre-release, npm tag "next")' : ''}`);

  // 1. Pre-flight --------------------------------------------------------------------------
  step(1, 'Pre-flight checks');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22) fail(`Node ${process.versions.node}: use Node 22 or newer`);
  ok(`Node ${process.versions.node}${major === 22 && minor < 12 ? ' (works; Node 22.12+ avoids an experimental-JSON warning from web_core)' : ''}`);

  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (branch !== BRANCH) fail(`on branch "${branch}": releases are cut from ${BRANCH}`);
  ok(`on ${BRANCH}`);

  const dirty = git('status', '--porcelain');
  if (dirty) fail(`working tree is not clean:\n${dirty}`);
  ok('working tree clean');

  const remote = tryGit('remote', 'get-url', 'origin') ?? '';
  const owner = /github\.com[:/]([^/]+)\//.exec(remote)?.[1];
  if (owner !== OWNER) fail(`origin is ${remote || '(none)'}: expected a github.com/${OWNER}/ repository`);
  const user = tryGit('config', 'user.name');
  if (user !== OWNER) fail(`git user.name is "${user}": commits to ${OWNER}/* must be made as ${OWNER} (set it with git config --local)`);
  if (!tryGit('config', 'user.email')) fail('git user.email is not set');
  ok(`identity: git user ${user}, origin owner ${owner}`);

  run('git', ['fetch', '--quiet', '--tags', 'origin', BRANCH]);
  const behind = Number(git('rev-list', '--count', `HEAD..origin/${BRANCH}`));
  if (behind) fail(`${BRANCH} is ${behind} commit(s) behind origin/${BRANCH}: pull first`);
  ok(`in sync with origin/${BRANCH}${Number(git('rev-list', '--count', `origin/${BRANCH}..HEAD`)) ? ' (local commits will be pushed with the release)' : ''}`);

  if (tryGit('rev-parse', '-q', '--verify', `refs/tags/${tag}`)) fail(`tag ${tag} already exists`);
  if (git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`)) fail(`tag ${tag} already exists on origin`);
  ok(`tag ${tag} is free`);

  try {
    const published = execFileSync(npm, ['view', `${pkg.name}@${version}`, 'version'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    if (published) fail(`${pkg.name}@${version} is already on npm`);
    ok(`${pkg.name}@${version} is not on npm yet`);
  } catch (e) {
    // An unknown name or version is a 404; anything else (offline, proxy) must not pass silently.
    if (!/E404|404 Not Found/.test(String(e.stderr))) fail(`could not ask npm whether ${version} exists:\n${e.stderr || e.message}`);
    ok(`${pkg.name}@${version} is not on npm yet`);
  }

  if (pkg.private) {
    const msg = 'package.json has "private": true, so npm would refuse to publish. Set it to false once the npm name is registered (see RELEASE.md).';
    if (DRY) warn(msg); else fail(msg);
  } else ok('package is publishable');

  let changelog;
  try { changelog = promoteChangelog(read('CHANGELOG.md'), version, new Date().toISOString().slice(0, 10)); } catch (e) {
    if (DRY) warn(e.message); else fail(e.message);
  }
  if (changelog) ok('CHANGELOG "Unreleased" has release notes');

  // 2. Bump --------------------------------------------------------------------------------
  step(2, `Bump to ${version}`);
  if (DRY) {
    for (const f of cdnFiles()) { const t = read(f); if (bumpCdn(t, version) !== t) console.log(`  would update CDN version in ${f}`); }
    console.log('  would update package.json, package-lock.json, src/index.js, CHANGELOG.md');
  } else {
    run(npm, ['version', version, '--no-git-tag-version', '--ignore-scripts', '--allow-same-version']);
    write('src/index.js', read('src/index.js').replace(/export const VERSION = '[^']+';/, `export const VERSION = '${version}';`));
    for (const f of cdnFiles()) { const t = read(f); const n = bumpCdn(t, version); if (n !== t) { write(f, n); ok(`CDN version in ${f}`); } }
    write('CHANGELOG.md', changelog);
    ok('package.json, package-lock.json, src/index.js, CHANGELOG.md');
  }

  // 3. Gates -------------------------------------------------------------------------------
  step(3, 'Build and verify');
  try {
    run(npm, ['run', 'build']);
    run(process.execPath, ['tools/cdn-tags.js', '--check']);
    run(npm, ['run', 'test:coverage']);
    run(npm, ['run', 'conformance:report']);
    run(process.execPath, ['tools/check-package.js', '--install']);
    run(process.execPath, ['tools/build-site.js']);
  } catch {
    console.error('\n✗ a gate failed.');
    if (!DRY && await confirm('Restore the working tree to HEAD (undo the bump and build output)?')) {
      git('checkout', '--', '.');
      console.log('  restored.');
    }
    process.exit(1);
  }
  ok('all gates passed');

  if (DRY) {
    const changed = git('status', '--porcelain');
    if (changed) {
      warn(`the gates rewrote tracked files (build output or the report date):\n${changed}`);
      warn('restore them with: git checkout -- .');
    }
    console.log(`\n✓ dry run complete: ${tag} is ready to release.\n`);
    return;
  }

  // 4. Commit and tag ----------------------------------------------------------------------
  step(4, `Commit and tag ${tag}`);
  console.log(git('status', '--short'));
  if (!await confirm(`Commit these changes as "release: ${tag}" and tag ${tag}?`)) {
    console.log('\n  Stopped before committing. The bumped files are left in place; git checkout -- . undoes them.\n');
    return;
  }
  git('add', '-A');
  git('commit', '-m', `release: ${tag}`);
  const signed = !!tryGit('config', 'user.signingkey');
  git('tag', signed ? '-s' : '-a', tag, '-m', `bitwrench-a2ui ${tag}`);
  ok(`committed and tagged ${tag}${signed ? ' (signed)' : ''}`);

  // 5. Push --------------------------------------------------------------------------------
  step(5, 'Push');
  if (!await confirm(`Push ${BRANCH} and ${tag} to origin? This starts the publish workflow.`)) {
    console.log(`\n  Not pushed. When ready: git push --atomic origin ${BRANCH} ${tag}\n`);
    return;
  }
  run('git', ['push', '--atomic', 'origin', BRANCH, tag]);
  console.log(`
✓ ${tag} pushed. The Release workflow now builds, tests, publishes to npm and creates the
  GitHub Release:  https://github.com/${OWNER}/bitwrench-a2ui/actions/workflows/release.yml
`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(e => fail(e.stack || e.message));
}
