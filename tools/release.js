#!/usr/bin/env node
// Cut a release: version, checks, commit, tag, push, then follow CI until npm and the
// GitHub Release are done. package.json holds the version (the single source of truth);
// src/version.js is generated from it. Publishing happens in CI, never from a laptop.
//
//   npm run release                             release the version in package.json as is
//                                               (e.g. a first version published by hand)
//   npm run release -- patch|minor|major        bump first: 0.9.0 -> 0.9.1 / 0.10.0 / 1.0.0
//   npm run release -- 0.10.0-rc.1              an explicit version (pre-releases go to "next")
//   npm run release:dry [-- minor]              every check and gate, nothing kept or pushed
//   flags: --yes (no prompts)  --no-watch (do not follow the workflow)
//
// Steps (stops at the first failure; see RELEASE.md):
//   1. Pre-flight   on main, clean, in sync with origin, git and gh identity are deftio, tag
//                   free, not already on npm (unless releasing a hand-published version),
//                   release notes in CHANGELOG, package not private
//   2. Version      package.json + package-lock.json (npm version), src/version.js, CDN URLs
//                   in docs and examples, CHANGELOG "Unreleased" -> "## X.Y.Z - date"
//   3. Gates        build, version and CDN checks, tests with the 100% coverage gate,
//                   conformance report, package check with a real install, site build
//   4. Commit + tag "release: vX.Y.Z" (if anything changed) and an annotated tag vX.Y.Z,
//                   signed when git has a signing key
//   5. Push + watch main and the tag, atomically. The tag starts .github/workflows/release.yml
//                   (npm via OIDC with provenance, attestations, GitHub Release); with gh
//                   signed in, the script follows that run and prints the release links.
//
// Steps 4 and 5 ask first. If a gate fails, the script offers to restore the working tree.
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
// Files the gates may rewrite without changing anything real: build timestamps and the
// report's date. Discarded before tagging when they are the only difference.
const NOISE = ['-I', '"built":', '-I', '^\\* \\*\\*Generated\\*\\*'];
const hasRealChanges = () => { try { git('diff', '--quiet', ...NOISE); return false; } catch { return true; } };
const ghOk = () => { try { execFileSync('gh', ['auth', 'status'], { stdio: 'ignore' }); return true; } catch { return false; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const pkg = JSON.parse(read('package.json'));
  const from = pkg.version;
  // No argument: release the version already in package.json (for example a first release
  // published by hand). Otherwise bump first.
  const bump = Boolean(target);
  let version = from;
  if (bump) {
    try { version = nextVersion(from, target); } catch (e) { fail(e.message); }
    if (compareVersions(version, from) <= 0) fail(`${version} is not newer than ${from}`);
  }
  const tag = `v${version}`;
  const prerelease = version.includes('-');
  console.log(`\nbitwrench-a2ui ${bump ? `${from} -> ${version}` : `${version} (the version in package.json)`}${prerelease ? ', pre-release (npm tag "next")' : ''}`);

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
  let ghUser = null;
  if (ghOk()) {
    ghUser = execFileSync('gh', ['api', 'user', '--jq', '.login'], { encoding: 'utf8' }).trim();
    if (ghUser !== OWNER) fail(`the active gh account is ${ghUser}: switch with gh auth switch -u ${OWNER}`);
  }
  ok(`identity: git user ${user}, origin owner ${owner}${ghUser ? `, gh account ${ghUser}` : ' (gh not signed in: the workflow will not be watched)'}`);

  run('git', ['fetch', '--quiet', '--tags', 'origin', BRANCH]);
  const behind = Number(git('rev-list', '--count', `HEAD..origin/${BRANCH}`));
  if (behind) fail(`${BRANCH} is ${behind} commit(s) behind origin/${BRANCH}: pull first`);
  ok(`in sync with origin/${BRANCH}${Number(git('rev-list', '--count', `origin/${BRANCH}..HEAD`)) ? ' (local commits will be pushed with the release)' : ''}`);

  if (tryGit('rev-parse', '-q', '--verify', `refs/tags/${tag}`)) fail(`tag ${tag} already exists`);
  if (git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`)) fail(`tag ${tag} already exists on origin`);
  ok(`tag ${tag} is free`);

  let onNpm = false;
  try {
    onNpm = Boolean(execFileSync(npm, ['view', `${pkg.name}@${version}`, 'version'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim());
  } catch (e) {
    // An unknown name or version is a 404; anything else (offline, proxy) must not pass silently.
    if (!/E404|404 Not Found/.test(String(e.stderr))) fail(`could not ask npm whether ${version} exists:\n${e.stderr || e.message}`);
  }
  if (onNpm && bump) fail(`${pkg.name}@${version} is already on npm`);
  if (onNpm) warn(`${pkg.name}@${version} is already on npm (published by hand?): the workflow will skip npm and create the GitHub Release`);
  else ok(`${pkg.name}@${version} is not on npm yet`);

  if (pkg.private) fail('package.json has "private": true, so npm would refuse to publish');
  ok('package is publishable');

  const today = new Date().toISOString().slice(0, 10);
  let changelog = read('CHANGELOG.md');
  const hasSection = new RegExp(`^## ${version.replace(/\./g, '\\.')} - `, 'm').test(changelog);
  if (!hasSection) {
    try { changelog = promoteChangelog(changelog, version, today); } catch (e) { fail(e.message); }
    ok('CHANGELOG "Unreleased" notes become the release notes');
  } else if (bump) {
    fail(`CHANGELOG.md already has a ${version} section`);
  } else ok(`CHANGELOG has a ${version} section`);

  // 2. Version -----------------------------------------------------------------------------
  step(2, bump ? `Bump to ${version}` : `Version ${version}`);
  const cdnChanges = cdnFiles().filter(f => bumpCdn(read(f), version) !== read(f));
  if (DRY) {
    if (bump) console.log('  would update package.json, package-lock.json and src/version.js');
    for (const f of cdnChanges) console.log(`  would update the CDN version in ${f}`);
    if (!hasSection) console.log('  would move the CHANGELOG "Unreleased" notes under the new version');
  } else {
    if (bump) run(npm, ['version', version, '--no-git-tag-version', '--ignore-scripts']);
    run(process.execPath, ['tools/gen-version.js']);
    for (const f of cdnChanges) { write(f, bumpCdn(read(f), version)); ok(`CDN version in ${f}`); }
    if (!hasSection) write('CHANGELOG.md', changelog);
  }
  ok('package.json is the single source of truth; src/version.js is generated from it');

  // 3. Gates -------------------------------------------------------------------------------
  step(3, 'Build and verify');
  try {
    run(npm, ['run', 'build']);
    run(process.execPath, ['tools/gen-version.js', '--check']);
    run(process.execPath, ['tools/cdn-tags.js', '--check']);
    run(npm, ['run', 'test:coverage']);
    run(npm, ['run', 'conformance:report']);
    run(process.execPath, ['tools/check-package.js', '--install']);
    run(process.execPath, ['tools/build-site.js']);
  } catch {
    console.error('\n✗ a gate failed.');
    if (await confirm('Restore the working tree to HEAD (undo the version change and build output)?')) {
      git('checkout', '--', '.');
      console.log('  restored.');
    }
    process.exit(1);
  }
  ok('all gates passed');
  if (!hasRealChanges()) git('checkout', '--', '.');   // only timestamps changed

  if (DRY) {
    const changed = git('status', '--porcelain');
    if (changed) warn(`the gates changed tracked files; restore them with git checkout -- .\n${changed}`);
    console.log(`\n✓ dry run complete: ${tag} is ready to release.\n`);
    return;
  }

  // 4. Commit and tag ----------------------------------------------------------------------
  step(4, `Commit and tag ${tag}`);
  const changes = git('status', '--porcelain');
  if (changes) console.log(changes);
  else console.log(`  nothing to commit: ${tag} will tag the current commit, ${git('rev-parse', '--short', 'HEAD')}`);
  if (!await confirm(changes ? `Commit these changes as "release: ${tag}" and tag ${tag}?` : `Tag ${git('rev-parse', '--short', 'HEAD')} as ${tag}?`)) {
    console.log('\n  Stopped. Nothing was committed or tagged; git checkout -- . undoes any file changes.\n');
    return;
  }
  if (changes) {
    git('add', '-A');
    git('commit', '-m', `release: ${tag}`);
  }
  const signed = !!tryGit('config', 'user.signingkey');
  git('tag', signed ? '-s' : '-a', tag, '-m', `bitwrench-a2ui ${tag}`);
  ok(`${changes ? 'committed and ' : ''}tagged ${tag}${signed ? ' (signed)' : ''}`);

  // 5. Push and follow the workflow --------------------------------------------------------
  step(5, 'Push');
  if (!await confirm(`Push ${BRANCH} and ${tag} to origin? This starts the Release workflow.`)) {
    console.log(`\n  Not pushed. When ready: git push --atomic origin ${BRANCH} ${tag}\n`);
    return;
  }
  run('git', ['push', '--atomic', 'origin', BRANCH, tag]);
  const actions = `https://github.com/${OWNER}/bitwrench-a2ui/actions/workflows/release.yml`;
  if (!ghUser || args.includes('--no-watch')) {
    console.log(`\n✓ ${tag} pushed. Follow the Release workflow at ${actions}\n`);
    return;
  }
  // Find the run for this tag and watch it to the end.
  let id = null;
  for (let i = 0; i < 30 && !id; i++) {
    await sleep(4000);
    id = execFileSync('gh', ['run', 'list', '--workflow', 'release.yml', '--branch', tag, '--limit', '1', '--json', 'databaseId', '--jq', '.[0].databaseId // empty'], { cwd: root, encoding: 'utf8' }).trim() || null;
  }
  if (!id) { console.log(`\n✓ ${tag} pushed, but the workflow run did not appear yet: ${actions}\n`); return; }
  try {
    execFileSync('gh', ['run', 'watch', id, '--exit-status', '--interval', '10'], { cwd: root, stdio: 'inherit' });
  } catch {
    fail(`the Release workflow failed: https://github.com/${OWNER}/bitwrench-a2ui/actions/runs/${id}\n  Fix the cause and re-run the failed jobs; every step is safe to repeat (RELEASE.md, Recovery).`);
  }
  console.log(`
✓ released ${tag}
  npm:     https://www.npmjs.com/package/${pkg.name}/v/${version}
  GitHub:  https://github.com/${OWNER}/bitwrench-a2ui/releases/tag/${tag}
  CDN:     https://cdn.jsdelivr.net/npm/${pkg.name}@${version}/dist/bitwrench-a2ui.min.js
`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(e => fail(e.stack || e.message));
}
