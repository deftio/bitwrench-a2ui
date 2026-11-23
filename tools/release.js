#!/usr/bin/env node
// Cut a release, end to end, from the maintainer's terminal. package.json holds the
// version (the single source of truth); src/version.js is generated from it. Nothing is
// published from a laptop: CI publishes the tagged commit.
//
//   npm run release                          a patch release: 0.9.0 -> 0.9.1
//   npm run release -- minor|major           0.9.0 -> 0.10.0 / 1.0.0
//   npm run release -- 0.10.0-rc.1           an explicit version (pre-releases go to "next")
//   npm run release -- 0.9.1                 resume a release that stopped part way
//   npm run release:dry                      steps 1-4 in a scratch worktree, then clean up
//   flags: --yes (no prompts)  --auto-merge (wait for an approving review instead of
//          merging with admin rights)
//
// Steps (each stops the release on failure; see RELEASE.md):
//   1. Pre-flight  identity (git user, gh account, origin owner are deftio), clean
//                  committed HEAD that contains origin/main, tag and branch free, version
//                  not on npm, CHANGELOG "Unreleased" notes
//   2. Worktree    a fresh git worktree of HEAD on branch release/vX.Y.Z, npm ci
//   3. Version     package.json + lockfile, src/version.js, CDN URLs, CHANGELOG, build,
//                  conformance report; committed as "release: vX.Y.Z"
//   4. Local CI    tools/ci.js on that commit: the same checks as ci.yml
//   5. PR          push the branch and open a pull request to main
//   6. Checks      wait for the required checks on GitHub
//   7. Merge       squash-merge (with admin rights, unless --auto-merge)
//   8. Tag         an annotated (or signed) tag vX.Y.Z on the merge commit, pushed
//   9. Publish     follow publish.yml (npm with provenance, GitHub Release); approve the
//                  npm version in the terminal (2FA) if npm staged it
//  10. Clean up    remove the worktree and the release branch; offer to move your checkout
//                  to the updated main and delete a feature branch the release contains
//
// The state lives on GitHub (the branch, the PR, the tag), so running the same version
// again picks up where it stopped, and running it after a release is done just reports
// it. Your checkout is only touched at the very end, and only after asking.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run') || args.includes('-n');
const YES = args.includes('--yes') || args.includes('-y');
const AUTO_MERGE = args.includes('--auto-merge');
// No argument means a patch release: the CHANGELOG check stops a run that has nothing new.
const target = args.find(a => !a.startsWith('-')) ?? 'patch';

// The GitHub owner, and the git user.name, that may release this package. Commits under
// another identity are an IP problem for the maintainer, so the script refuses them.
const OWNER = 'deftio';
const REPO = `${OWNER}/bitwrench-a2ui`;
const BASE = 'main';
const WORKFLOW = 'publish.yml';

// ---- pure helpers (unit tested) --------------------------------------------------------
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
/** Paths of the worktrees that have a branch checked out, from `git worktree list --porcelain`. */
export function worktreesOn(porcelain, branch) {
  return porcelain.split(/\n\n+/).filter(b => b.split('\n').includes(`branch refs/heads/${branch}`))
    .map(b => b.split('\n').find(l => l.startsWith('worktree ')).slice(9));
}
/** The body of the CHANGELOG section for a version, without its heading. */
export function changelogSection(text, version) {
  const esc = version.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  const m = new RegExp(`^## ${esc} [^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(text);
  return m ? m[1].trim() : null;
}
/**
 * Where a release stands, from what GitHub has: the tag on origin wins, then the PR of
 * the release branch.
 */
export function releaseState({ tagOnOrigin, pr }) {
  if (tagOnOrigin) return 'publish';
  if (pr?.state === 'MERGED') return 'tag';
  if (pr?.state === 'OPEN') return 'checks';
  return 'new';
}
/** The staged npm entry for a version, from `npm stage list --json`. */
export function findStaged(items, name, version) {
  return (Array.isArray(items) ? items : []).find(i => i.packageName === name && i.version === version) ?? null;
}

// ---- process helpers -------------------------------------------------------------------
const sh = (cmd, a, cwd = root) => execFileSync(cmd, a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const trySh = (cmd, a, cwd) => { try { return sh(cmd, a, cwd); } catch { return null; } };
const git = (...a) => sh('git', a);
const tryGit = (...a) => trySh('git', a);
const gh = (...a) => sh('gh', a);
const tryGh = (...a) => trySh('gh', a);
function run(cmd, a, cwd = root) {
  console.log(`\n  $ ${path.basename(cmd)} ${a.join(' ')}`);
  execFileSync(cmd, a, { cwd, stdio: 'inherit' });
}
const tryRun = (cmd, a, cwd) => { try { run(cmd, a, cwd); return true; } catch { return false; } };
function step(n, label) { console.log(`\n${'─'.repeat(64)}\n ${n}. ${label}${DRY ? '   (dry run)' : ''}\n${'─'.repeat(64)}`); }
function fail(msg) { console.error(`\n✗ release stopped: ${msg}\n`); process.exit(1); }
const ok = msg => console.log(`  ✓ ${msg}`);
const warn = msg => console.log(`  ! ${msg}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function confirm(question) {
  if (YES) return true;
  if (!process.stdin.isTTY) fail(`"${question}" needs an answer: run in a terminal or pass --yes`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`\n  ${question} [y/N] `)).trim().toLowerCase();
  rl.close();
  return answer === 'y' || answer === 'yes';
}

// npm: published, staged, or neither. Anything but a 404 (offline, proxy) must not pass silently.
function onNpm(name, version) {
  try {
    return Boolean(execFileSync(npm, ['view', `${name}@${version}`, 'version'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim());
  } catch (e) {
    if (/E404|404 Not Found/.test(String(e.stderr))) return false;
    fail(`could not ask npm whether ${version} exists:\n${e.stderr || e.message}`);
  }
}
function staged(name, version) {
  const out = trySh(npm, ['stage', 'list', name, '--json']);
  if (out === null) return undefined;   // not signed in to npm, or an npm without "stage"
  try { return findStaged(JSON.parse(out), name, version); } catch { return undefined; }
}

// Files that may carry the CDN URL of this package: bumped to the new version.
function cdnFiles(cwd) {
  const list = (dir, ext) => sh('git', ['ls-files', dir], cwd).split('\n').filter(f => f.endsWith(ext));
  return ['README.md', 'llms.txt', ...list('docs', '.md'), ...list('examples', '.html'), ...list('pages', '.html')];
}

// ---- main ------------------------------------------------------------------------------
async function main() {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  let version;
  try { version = nextVersion(pkg.version, target); } catch (e) { fail(e.message); }
  const tag = `v${version}`;
  const branch = `release/${tag}`;
  const prerelease = version.includes('-');

  // 1. Pre-flight --------------------------------------------------------------------------
  step(1, 'Pre-flight checks');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22) fail(`Node ${process.versions.node}: use Node 22 or newer`);
  ok(`Node ${process.versions.node}${major === 22 && minor < 12 ? ' (works; Node 22.12+ avoids an experimental-JSON warning from web_core)' : ''}`);

  const remote = tryGit('remote', 'get-url', 'origin') ?? '';
  const owner = /github\.com[:/]([^/]+)\//.exec(remote)?.[1];
  if (owner !== OWNER) fail(`origin is ${remote || '(none)'}: expected a github.com/${OWNER}/ repository`);
  const user = tryGit('config', 'user.name');
  if (user !== OWNER) fail(`git user.name is "${user}": commits to ${OWNER}/* must be made as ${OWNER} (set it with git config --local)`);
  if (!tryGit('config', 'user.email')) fail('git user.email is not set');
  const ghUser = tryGh('api', 'user', '--jq', '.login');
  if (!ghUser && !DRY) fail('gh is not signed in: run gh auth login (the release opens and merges a pull request)');
  if (ghUser && ghUser !== OWNER) fail(`the active gh account is ${ghUser}: switch with gh auth switch -u ${OWNER}`);
  ok(`identity: git user ${user}, origin owner ${owner}, gh account ${ghUser ?? '(not signed in; fine for a dry run)'}`);

  run('git', ['fetch', '--quiet', '--tags', 'origin', BASE]);
  const tagOnOrigin = Boolean(git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`));
  const pr = ghUser ? JSON.parse(gh('pr', 'list', '--repo', REPO, '--head', branch, '--state', 'all', '--limit', '1', '--json', 'number,state,url,headRefOid,mergeCommit'))[0] ?? null : null;
  const state = releaseState({ tagOnOrigin, pr });

  if (state === 'new') {
    if (compareVersions(version, pkg.version) <= 0) {
      fail(`${version} is not newer than package.json (${pkg.version}), and there is no ${branch} pull request or ${tag} tag to resume`);
    }
    console.log(`\nbitwrench-a2ui ${pkg.version} -> ${version}${prerelease ? ', pre-release (npm tag "next")' : ''}`);
    const dirty = git('status', '--porcelain');
    if (dirty) fail(`working tree is not clean: the release is built from the committed HEAD, so commit or stash first:\n${dirty}`);
    if (tryGit('merge-base', '--is-ancestor', `origin/${BASE}`, 'HEAD') === null) fail(`HEAD does not contain origin/${BASE}: merge or rebase onto it first`);
    const extra = Number(git('rev-list', '--count', `origin/${BASE}..HEAD`));
    ok(`releasing ${git('rev-parse', '--abbrev-ref', 'HEAD')} @ ${git('rev-parse', '--short', 'HEAD')}${extra ? `, with ${extra} commit(s) not yet on ${BASE} (they go into the release PR)` : ''}`);
    if (tryGit('rev-parse', '-q', '--verify', `refs/tags/${tag}`)) fail(`tag ${tag} already exists locally: git tag -d ${tag} if it is stale`);
    if (git('ls-remote', '--heads', 'origin', branch)) fail(`branch ${branch} exists on origin without a pull request: delete it or open the PR, then run again`);
    ok(`tag ${tag} and branch ${branch} are free`);
    if (onNpm(pkg.name, version)) fail(`${pkg.name}@${version} is already on npm`);
    ok(`${pkg.name}@${version} is not on npm yet`);
    if (pkg.private) fail('package.json has "private": true, so npm would refuse to publish');
    const today = new Date().toISOString().slice(0, 10);
    try { promoteChangelog(readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), version, today); } catch (e) { fail(e.message); }
    ok('CHANGELOG "Unreleased" has the release notes');
    if (!onNpm(pkg.name, pkg.version) && !git('ls-remote', '--tags', 'origin', `refs/tags/v${pkg.version}`)) warn(`package.json's ${pkg.version} was never released: if you meant to resume it, run npm run release -- ${pkg.version}`);

    // 2. Worktree --------------------------------------------------------------------------
    step(2, `Fresh worktree on ${branch}`);
    // A fresh private directory (mode 0700, unpredictable name) holds the worktree and the
    // PR body, so nothing else on the machine can pre-create or read them.
    const tmp = mkdtempSync(path.join(os.tmpdir(), `bitwrench-a2ui-${tag}-`));
    const wt = path.join(tmp, 'worktree');
    // A worktree left by an interrupted run still holds the branch: remove it first.
    for (const stale of worktreesOn(tryGit('worktree', 'list', '--porcelain') || '', branch)) tryGit('worktree', 'remove', '--force', stale);
    tryGit('worktree', 'prune');
    if (tryGit('rev-parse', '-q', '--verify', `refs/heads/${branch}`)) git('branch', '-D', branch);
    run('git', ['worktree', 'add', '-b', branch, wt, 'HEAD']);
    const cleanup = () => {
      tryGit('worktree', 'remove', '--force', wt);
      tryGit('branch', '-D', branch);
      rmSync(tmp, { recursive: true, force: true });
    };
    try {
      run(npm, ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], wt);

      // 3. Version ---------------------------------------------------------------------------
      step(3, `Version ${version}`);
      const at = rel => path.join(wt, rel);
      run(npm, ['version', version, '--no-git-tag-version', '--ignore-scripts'], wt);
      run(process.execPath, ['tools/gen-version.js'], wt);
      for (const f of cdnFiles(wt)) {
        const before = readFileSync(at(f), 'utf8');
        const after = bumpCdn(before, version);
        if (after !== before) { writeFileSync(at(f), after); ok(`CDN version in ${f}`); }
      }
      writeFileSync(at('CHANGELOG.md'), promoteChangelog(readFileSync(at('CHANGELOG.md'), 'utf8'), version, new Date().toISOString().slice(0, 10)));
      ok('CHANGELOG "Unreleased" notes moved under the new version');
      run(npm, ['run', 'build'], wt);
      run(npm, ['run', 'conformance:report'], wt);
      sh('git', ['add', '-A'], wt);
      sh('git', ['commit', '-q', '-m', `release: ${tag}`], wt);
      ok(`committed "release: ${tag}" on ${branch} (local only)`);

      // 4. Local CI --------------------------------------------------------------------------
      step(4, 'Local CI (tools/ci.js, the same checks as ci.yml)');
      if (!tryRun(process.execPath, ['tools/ci.js'], wt)) throw new Error('local CI failed; nothing was pushed');
      ok('local CI passed');
    } catch (e) {
      cleanup();
      fail(`${e.message}\n  The worktree and the local ${branch} branch were removed.`);
    }
    if (DRY) {
      cleanup();
      console.log(`\n✓ dry run complete: ${tag} builds and passes CI. Nothing was pushed; the worktree is removed.\n`);
      return;
    }

    // 5. PR ----------------------------------------------------------------------------------
    step(5, 'Pull request');
    if (!await confirm(`Push ${branch} and open a pull request to ${BASE}?`)) {
      cleanup();
      console.log('\n  Stopped before pushing. The worktree and branch were removed.\n');
      return;
    }
    run('git', ['push', '-u', 'origin', branch], wt);
    const notes = changelogSection(readFileSync(path.join(wt, 'CHANGELOG.md'), 'utf8'), version);
    const bodyFile = path.join(tmp, 'pr-body.md');
    writeFileSync(bodyFile, `Release ${tag}, opened by \`npm run release\`. Local CI passed on this commit; the release script merges it when the required checks pass, then tags the merge commit.\n\n${notes}\n`);
    run('gh', ['pr', 'create', '--repo', REPO, '--base', BASE, '--head', branch, '--title', `release: ${tag}`, '--body-file', bodyFile]);
    rmSync(bodyFile, { force: true });
    cleanup();   // the branch is on GitHub now; the local copy is not needed
    return resume(pkg, version);
  }

  console.log(`\nResuming ${tag}: ${state === 'checks' ? `pull request ${pr.url} is open` : state === 'tag' ? `pull request ${pr.url} is merged, ${tag} is not tagged yet` : `${tag} is on GitHub`}`);
  if (DRY) { console.log('\n  dry run: nothing to rehearse for a release in progress.\n'); return; }
  return resume(pkg, version);
}

async function resume(pkg, version) {
  const tag = `v${version}`;
  const branch = `release/${tag}`;
  const prOf = () => JSON.parse(gh('pr', 'list', '--repo', REPO, '--head', branch, '--state', 'all', '--limit', '1', '--json', 'number,state,url,headRefOid,mergeCommit'))[0] ?? null;
  let tagOnOrigin = Boolean(git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`));
  let pr = prOf();

  // 6. Checks --------------------------------------------------------------------------------
  if (releaseState({ tagOnOrigin, pr }) === 'checks') {
    step(6, `Required checks on #${pr.number}`);
    // Checks take a moment to register after a push.
    for (let i = 0; i < 36 && !JSON.parse(tryGh('pr', 'checks', String(pr.number), '--repo', REPO, '--required', '--json', 'name') || '[]').length; i++) await sleep(5000);
    if (!tryRun('gh', ['pr', 'checks', String(pr.number), '--repo', REPO, '--required', '--watch', '--fail-fast', '--interval', '20'])) {
      fail(`a required check failed on ${pr.url}\n  Push a fix to ${branch} and run npm run release -- ${version} again.`);
    }
    ok('required checks passed');

    // 7. Merge -------------------------------------------------------------------------------
    step(7, `Merge #${pr.number}`);
    const how = AUTO_MERGE ? 'enable auto-merge (squash) once a review approves it' : 'squash-merge it now with admin rights (you cannot approve your own PR)';
    if (!await confirm(`Required checks are green. ${how[0].toUpperCase()}${how.slice(1)}?`)) {
      console.log(`\n  Not merged. Run npm run release -- ${version} again to continue.\n`);
      return;
    }
    run('gh', ['pr', 'merge', String(pr.number), '--repo', REPO, '--squash', AUTO_MERGE ? '--auto' : '--admin',
      '--match-head-commit', pr.headRefOid, '--subject', `release: ${tag} (#${pr.number})`, '--body', '']);
    for (let i = 0; i < 720 && pr.state !== 'MERGED'; i++) {
      await sleep(5000);
      pr = prOf();
      if (pr.state === 'CLOSED') fail(`${pr.url} was closed without merging`);
      if (i === 0 && pr.state !== 'MERGED') console.log('  waiting for the merge…');
    }
    if (pr.state !== 'MERGED') fail(`${pr.url} is not merged yet; run npm run release -- ${version} again later`);
    ok(`merged as ${pr.mergeCommit.oid.slice(0, 7)}`);
  }

  // 8. Tag -----------------------------------------------------------------------------------
  if (releaseState({ tagOnOrigin, pr }) === 'tag') {
    step(8, `Tag ${tag}`);
    const sha = pr.mergeCommit.oid;
    run('git', ['fetch', '--quiet', 'origin', BASE]);
    if (tryGit('merge-base', '--is-ancestor', sha, `origin/${BASE}`) === null) fail(`merge commit ${sha} is not on origin/${BASE}`);
    const tagged = JSON.parse(git('show', `${sha}:package.json`)).version;
    if (tagged !== version) fail(`package.json at ${sha.slice(0, 7)} says ${tagged}, not ${version}`);
    if (tryGit('diff', '--quiet', pr.headRefOid, sha) === null) {
      warn(`the merge commit differs from the tested branch head (${BASE} moved during the release); publish.yml runs every check again on the tag`);
    } else ok('the merge commit has exactly the tree that passed CI');
    if (!await confirm(`Tag ${sha.slice(0, 7)} as ${tag} and push the tag? This starts ${WORKFLOW} (npm and the GitHub Release).`)) {
      console.log(`\n  Not tagged. Run npm run release -- ${version} again to continue.\n`);
      return;
    }
    if (tryGit('rev-parse', '-q', '--verify', `refs/tags/${tag}`)) git('tag', '-d', tag);   // a stale local tag from an earlier attempt
    const signed = Boolean(tryGit('config', 'user.signingkey'));
    git('tag', signed ? '-s' : '-a', tag, sha, '-m', `bitwrench-a2ui ${tag}`);
    run('git', ['push', 'origin', `refs/tags/${tag}`]);
    ok(`pushed ${tag}${signed ? ' (signed)' : ''}`);
    tagOnOrigin = true;
    tryRun('git', ['push', 'origin', '--delete', branch]);
  }

  // 9. Publish -------------------------------------------------------------------------------
  step(9, 'Publish');
  await approveIfStaged(pkg.name, version);
  // The run for this tag. Tags before 0.9.1 ran the same workflow under its old name.
  let id = null;
  for (let i = 0; i < 30 && !id; i++) {
    id = tryGh('run', 'list', '--repo', REPO, '--branch', tag, '--event', 'push', '--limit', '10', '--json', 'databaseId,workflowName',
      '--jq', '[.[] | select(.workflowName == "Publish" or .workflowName == "Release")][0].databaseId // empty') || null;
    if (!id) await sleep(4000);
  }
  if (!id) fail(`no ${WORKFLOW} run appeared for ${tag}: https://github.com/${REPO}/actions/workflows/${WORKFLOW}`);
  const runUrl = `https://github.com/${REPO}/actions/runs/${id}`;
  const conclusion = gh('run', 'view', id, '--repo', REPO, '--json', 'status,conclusion', '--jq', '.status + " " + .conclusion');
  if (/^completed (failure|cancelled|timed_out)/.test(conclusion)) {
    if (!await confirm(`The ${WORKFLOW} run for ${tag} ended in ${conclusion.split(' ')[1]} (${runUrl}). Re-run its failed jobs?`)) return;
    run('gh', ['run', 'rerun', id, '--repo', REPO, '--failed']);
    await sleep(5000);
  }
  if (!tryRun('gh', ['run', 'watch', id, '--repo', REPO, '--exit-status', '--interval', '10'])) {
    fail(`${WORKFLOW} failed: ${runUrl}\n  Fix the cause, then run npm run release -- ${version} again (it offers to re-run the failed jobs).`);
  }
  await approveIfStaged(pkg.name, version);
  let live = false;
  for (let i = 0; i < 12 && !(live = onNpm(pkg.name, version)); i++) await sleep(5000);
  if (!live) fail(`${pkg.name}@${version} is not on npm after the workflow: check ${runUrl} and npm stage list ${pkg.name}`);
  ok(`${pkg.name}@${version} is on npm (dist-tags: ${trySh(npm, ['view', pkg.name, 'dist-tags', '--json'])?.replace(/\s+/g, ' ')})`);

  // 10. Clean up -----------------------------------------------------------------------------
  step(10, 'Clean up');
  if (git('ls-remote', '--heads', 'origin', branch)) tryRun('git', ['push', 'origin', '--delete', branch]);
  tryGit('fetch', '--quiet', '--tags', 'origin', BASE);
  await tidyCheckout(pr);
  console.log(`
✓ released ${tag}
  npm:     https://www.npmjs.com/package/${pkg.name}/v/${version}
  GitHub:  https://github.com/${REPO}/releases/tag/${tag}
  CDN:     https://cdn.jsdelivr.net/npm/${pkg.name}@${version}/dist/bitwrench-a2ui.min.js
`);
}

/**
 * What to do with the maintainer's checkout once a release is out: on main, fast-forward
 * it; on a branch whose commits all went into the release PR, switch to main and delete
 * the branch (its work is on main now, squashed). Anything else is left alone.
 */
export function tidyPlan({ current, base, clean, inRelease }) {
  if (!clean || !current || current === 'HEAD') return 'none';
  if (current === base) return 'pull';
  return inRelease ? 'switch-delete' : 'none';
}

async function tidyCheckout(pr) {
  const current = tryGit('rev-parse', '--abbrev-ref', 'HEAD');
  const clean = tryGit('status', '--porcelain') === '';
  let inRelease = false;
  if (current && current !== BASE && pr) {
    // The tested head of the release PR; a squash merge does not contain it, so ask it directly.
    tryGit('fetch', '--quiet', 'origin', `refs/pull/${pr.number}/head`);
    inRelease = tryGit('merge-base', '--is-ancestor', 'HEAD', pr.headRefOid) !== null;
  }
  const plan = tidyPlan({ current, base: BASE, clean, inRelease });
  if (plan === 'none') {
    if (current !== BASE) console.log(`  Your checkout (${current}${clean ? '' : ', with uncommitted changes'}) was left as is. For the release commit: git switch ${BASE} && git pull --ff-only`);
    return;
  }
  if (plan === 'pull') {
    if (await confirm(`Fast-forward your ${BASE} to origin/${BASE}?`)) tryRun('git', ['merge', '--ff-only', `origin/${BASE}`]);
    return;
  }
  const remoteToo = Boolean(tryGit('ls-remote', '--heads', 'origin', current));
  if (!await confirm(`Every commit on ${current} is in the release. Switch to ${BASE}, update it, and delete ${current}${remoteToo ? ' (here and on origin)' : ''}?`)) return;
  if (!tryRun('git', ['switch', BASE])) return;
  tryRun('git', ['merge', '--ff-only', `origin/${BASE}`]);
  tryRun('git', ['branch', '-D', current]);
  if (remoteToo) tryRun('git', ['push', 'origin', '--delete', current]);
  ok(`now on ${BASE} at ${git('rev-parse', '--short', 'HEAD')}; ${current} deleted`);
}

// A version npm staged (by hand, or by a trusted publisher limited to staging) waits for
// a maintainer's 2FA approval. Approve it here, in the terminal, instead of on npmjs.com.
async function approveIfStaged(name, version) {
  if (onNpm(name, version)) return;
  const item = staged(name, version);
  if (item === undefined) { warn('could not list staged npm versions (npm login, npm 11.15+): skipping the staged check'); return; }
  if (!item) return;
  console.log(`  ${name}@${version} is staged on npm (id ${item.id}, staged ${item.createdAt ?? ''} by ${item.actor ?? '?'}, shasum ${item.shasum ?? '?'})`);
  if (!await confirm(`Approve the staged ${name}@${version}, publishing it? npm asks for your 2FA code.`)) fail('the staged version was not approved');
  // Interactive: npm prompts for the one-time password.
  execFileSync(npm, ['stage', 'approve', item.id], { cwd: root, stdio: 'inherit' });
  ok(`approved ${name}@${version}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(e => fail(e.stack || e.message));
}
