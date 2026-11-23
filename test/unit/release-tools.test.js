// The pure parts of tools/release.js: version arithmetic and the file rewrites.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { bumpCdn, changelogSection, compareVersions, findStaged, nextVersion, promoteChangelog, releaseState, rulesetDrift, covers, tidyPlan, worktreesOn } from '../../tools/release.js';
import { advisories, evaluate } from '../../tools/audit.js';
import { JOBS } from '../../tools/ci.js';

describe('release tooling', () => {
  it('computes the next version', () => {
    assert.equal(nextVersion('0.1.0', 'patch'), '0.1.1');
    assert.equal(nextVersion('0.1.0', 'minor'), '0.2.0');
    assert.equal(nextVersion('0.1.9', 'major'), '1.0.0');
    assert.equal(nextVersion('0.2.0-rc.1', 'patch'), '0.2.0');
    assert.equal(nextVersion('0.1.0', '0.2.0-rc.1'), '0.2.0-rc.1');
    assert.throws(() => nextVersion('0.1.0', 'banana'), /not patch, minor, major/);
    assert.throws(() => nextVersion('x', 'patch'), /not semver/);
  });

  it('orders versions, pre-releases first', () => {
    assert.ok(compareVersions('0.2.0', '0.1.9') > 0);
    assert.ok(compareVersions('0.2.0-rc.1', '0.2.0') < 0);
    assert.ok(compareVersions('0.2.0', '0.2.0-rc.1') > 0);
    assert.ok(compareVersions('0.2.0-rc.2', '0.2.0-rc.1') > 0);
    assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  });

  it('bumps only this package\'s CDN URLs', () => {
    const text = 'a https://cdn.jsdelivr.net/npm/bitwrench-a2ui@0.1.0/dist/x.js b https://cdn.jsdelivr.net/npm/bitwrench@2.1.15/dist/y.js c bitwrench-a2ui@0.1.0-rc.2/';
    assert.equal(bumpCdn(text, '0.2.0'), 'a https://cdn.jsdelivr.net/npm/bitwrench-a2ui@0.2.0/dist/x.js b https://cdn.jsdelivr.net/npm/bitwrench@2.1.15/dist/y.js c bitwrench-a2ui@0.1.0-rc.2/');
  });

  it('turns the Unreleased notes into a dated release section', () => {
    const before = '# Changelog\n\n## Unreleased\n\n* **Fix** - a bug.\n\n## 0.1.0 - 2026-11-22\n\nFirst.\n';
    assert.equal(promoteChangelog(before, '0.1.1', '2026-12-01'),
      '# Changelog\n\n## Unreleased\n\nNothing yet.\n\n## 0.1.1 - 2026-12-01\n\n* **Fix** - a bug.\n\n## 0.1.0 - 2026-11-22\n\nFirst.\n');
    assert.throws(() => promoteChangelog('# C\n\n## Unreleased\n\nNothing yet.\n\n## 0.1.0 - x\n', '0.1.1', 'd'), /empty/);
    assert.throws(() => promoteChangelog('# C\n\n## 0.1.0 - x\n', '0.1.1', 'd'), /no "## Unreleased"/);
  });

  it('reads one CHANGELOG section for the PR and release notes', () => {
    const text = '# C\n\n## Unreleased\n\nNothing yet.\n\n## 0.9.1 - 2026-12-01\n\n* fix\n\n## 0.9.0 - 2026-11-22\n\nFirst.\n';
    assert.equal(changelogSection(text, '0.9.1'), '* fix');
    assert.equal(changelogSection(text, '0.9.0'), 'First.');
    assert.equal(changelogSection(text, '0.9.2'), null);
    assert.equal(changelogSection(text, '0.9'), null);
    // Regex metacharacters in the version are literal.
    assert.equal(changelogSection('## 1.0.0-rc.1+b (x) - d\n\nRC\n', '1.0.0-rc.1+b (x)'), 'RC');
    assert.equal(changelogSection('## 1x0x0 - d\n\nno\n', '1.0.0'), null);
    assert.equal(changelogSection('## 1\\0 - d\n\nbs\n', '1\\0'), 'bs');
  });

  it('finds the worktrees that hold a branch, so an interrupted run can be cleaned up', () => {
    const list = 'worktree /repo\nHEAD abc\nbranch refs/heads/main\n\nworktree /tmp/x/worktree\nHEAD def\nbranch refs/heads/release/v1.0.0\n\nworktree /tmp/d\nHEAD 123\ndetached\n';
    assert.deepEqual(worktreesOn(list, 'release/v1.0.0'), ['/tmp/x/worktree']);
    assert.deepEqual(worktreesOn(list, 'release/v1.0'), []);
    assert.deepEqual(worktreesOn('', 'main'), []);
  });

  it('resumes from what GitHub has: tag, then merged PR, then open PR', () => {
    assert.equal(releaseState({ tagOnOrigin: true, pr: { state: 'OPEN' } }), 'publish');
    assert.equal(releaseState({ tagOnOrigin: false, pr: { state: 'MERGED' } }), 'tag');
    assert.equal(releaseState({ tagOnOrigin: false, pr: { state: 'OPEN' } }), 'checks');
    assert.equal(releaseState({ tagOnOrigin: false, pr: { state: 'CLOSED' } }), 'new');
    assert.equal(releaseState({ tagOnOrigin: false, pr: null }), 'new');
  });

  it('rebuilds an open PR that was built before HEAD, so a fix is just another run', () => {
    assert.equal(releaseState({ tagOnOrigin: false, pr: { state: 'OPEN' }, headInPr: false }), 'rebuild');
    assert.equal(releaseState({ tagOnOrigin: false, pr: { state: 'OPEN' }, headInPr: true }), 'checks');
    // Once merged or tagged, a newer HEAD belongs to the next version.
    assert.equal(releaseState({ tagOnOrigin: false, pr: { state: 'MERGED' }, headInPr: false }), 'tag');
    assert.equal(releaseState({ tagOnOrigin: true, pr: { state: 'OPEN' }, headInPr: false }), 'publish');
  });

  it('compares rulesets with what GitHub returns, ignoring the fields GitHub adds', () => {
    assert.ok(covers({ a: 1, b: [{ c: 2 }, { c: 3 }] }, { a: 1, id: 9, b: [{ c: 3, x: 0 }, { c: 2 }] }));
    assert.ok(!covers({ a: 1 }, { a: 2 }));
    assert.ok(!covers({ b: [1, 2] }, { b: [1, 2, 3] }));
    assert.ok(!covers({ b: [1] }, { b: 1 }));
    assert.ok(!covers({ a: { b: 1 } }, { a: null }));
    assert.ok(!covers({ a: { b: 1 } }, {}));

    const dir = new URL('../../.github/rulesets/', import.meta.url);
    const desired = readdirSync(dir).map(f => JSON.parse(readFileSync(new URL(f, dir), 'utf8')));
    assert.deepEqual(desired.map(d => d.name).sort(), ['main', 'release tags']);
    // What GitHub returns: the same rules plus ids, links and defaults.
    const fromGitHub = desired.map((d, i) => ({ id: i + 1, source_type: 'Repository', _links: {}, current_user_can_bypass: 'always', ...structuredClone(d),
      rules: d.rules.map(r => r.parameters ? { ...r, parameters: { automatic_copilot_code_review_enabled: false, ...r.parameters } } : r) }));
    assert.deepEqual(rulesetDrift(desired, fromGitHub), []);
    assert.deepEqual(rulesetDrift(desired, []).sort(), ['main', 'release tags']);
    const noChecks = fromGitHub.map(r => r.name === 'main' ? { ...r, rules: r.rules.filter(x => x.type !== 'required_status_checks') } : r);
    assert.deepEqual(rulesetDrift(desired, noChecks), ['main']);
    // The required checks are the job names in the workflows.
    const main = desired.find(d => d.name === 'main');
    const contexts = main.rules.find(r => r.type === 'required_status_checks').parameters.required_status_checks.map(c => c.context);
    const workflows = ['ci', 'codeql', 'dependency-review'].map(w => readFileSync(new URL(`../../.github/workflows/${w}.yml`, import.meta.url), 'utf8')).join('\n');
    const jobNames = [...workflows.matchAll(/^ {4}name: (.+)$/gm)]
      .map(m => new RegExp(`^${m[1].split(/\$\{\{[^}]*\}\}/).map(p => p.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')).join('.+')}$`));
    for (const c of contexts) assert.ok(jobNames.some(re => re.test(c)), `no workflow job is named "${c}"`);
  });

  it('tidies the checkout only when that is safe', () => {
    assert.equal(tidyPlan({ current: 'main', base: 'main', clean: true }), 'pull');
    assert.equal(tidyPlan({ current: 'fix', base: 'main', clean: true, inRelease: true }), 'switch-delete');
    assert.equal(tidyPlan({ current: 'fix', base: 'main', clean: true, inRelease: false }), 'none');
    assert.equal(tidyPlan({ current: 'fix', base: 'main', clean: false, inRelease: true }), 'none');
    assert.equal(tidyPlan({ current: 'HEAD', base: 'main', clean: true }), 'none');
    assert.equal(tidyPlan({ current: null, base: 'main', clean: true }), 'none');
  });

  it('finds a staged npm version', () => {
    const items = [{ id: 'a', packageName: 'other', version: '0.9.0' }, { id: 'b', packageName: 'bitwrench-a2ui', version: '0.9.0' }];
    assert.equal(findStaged(items, 'bitwrench-a2ui', '0.9.0').id, 'b');
    assert.equal(findStaged(items, 'bitwrench-a2ui', '0.9.1'), null);
    assert.equal(findStaged(null, 'bitwrench-a2ui', '0.9.0'), null);
  });
});

describe('runtime audit allowlist', () => {
  const report = { vulnerabilities: {
    '@a2ui/web_core': { via: ['zod'] },
    zod: { via: [{ source: 1, name: 'zod', title: 'mem', url: 'https://github.com/advisories/GHSA-mrhx-c7xc-m3w5', severity: 'high', range: '<4.6.6' },
      { source: 1, name: 'zod', title: 'mem', url: 'https://github.com/advisories/GHSA-mrhx-c7xc-m3w5', severity: 'high', range: '<4.6.6' }] },
    x: { via: [{ source: 7, name: 'x', title: 'low one', severity: 'low' }] },
  } };

  it('collects advisories once each, by GHSA id', () => {
    assert.deepEqual(advisories(report).map(a => a.id), ['GHSA-mrhx-c7xc-m3w5', 'npm-7']);
    assert.deepEqual(advisories({}), []);
  });

  it('blocks unlisted advisories, honours expiry and package, reports stale entries', () => {
    const found = advisories(report);
    const entry = { id: 'GHSA-mrhx-c7xc-m3w5', package: 'zod', reason: 'r', expires: '2027-02-28' };
    let r = evaluate(found, { advisories: [entry, { id: 'GHSA-gone', package: 'y', expires: '2027-01-01' }] }, '2026-11-22');
    assert.deepEqual([r.allowed.length, r.blocking.length, r.expired.length, r.stale.map(e => e.id)], [1, 0, 0, ['GHSA-gone']]);
    r = evaluate(found, { advisories: [entry] }, '2027-02-28');
    assert.equal(r.allowed.length, 1, 'valid through the expiry date');
    r = evaluate(found, { advisories: [entry] }, '2027-03-01');
    assert.equal(r.expired.length, 1);
    r = evaluate(found, { advisories: [{ ...entry, package: 'not-zod' }] }, '2026-11-22');
    assert.equal(r.blocking.length, 1, 'an entry only covers the package it names');
    r = evaluate(found, {}, '2026-11-22', 'low');
    assert.equal(r.blocking.length, 2);
  });

  it('the committed allowlist is well formed', () => {
    const list = JSON.parse(readFileSync(new URL('../../.github/audit-allowlist.json', import.meta.url), 'utf8'));
    for (const e of list.advisories) {
      assert.match(e.id, /^GHSA-/);
      assert.ok(e.package && e.reason && e.mitigation, `${e.id} needs package, reason and mitigation`);
      assert.match(e.expires, /^\d{4}-\d{2}-\d{2}$/);
    }
    const review = readFileSync(new URL('../../.github/workflows/dependency-review.yml', import.meta.url), 'utf8');
    for (const e of list.advisories) assert.ok(review.includes(e.id), `dependency-review.yml allows ${e.id} too`);
  });

  it('osv-scanner.toml (read by Scorecard) has every runtime exception, each with a reason and a live expiry', () => {
    const toml = readFileSync(new URL('../../osv-scanner.toml', import.meta.url), 'utf8');
    const entries = toml.split('[[IgnoredVulns]]').slice(1).map(block => ({
      id: /^id = "([^"]+)"$/m.exec(block)?.[1],
      until: /^ignoreUntil = (\d{4}-\d{2}-\d{2})$/m.exec(block)?.[1],
      reason: /^reason = "([^"]+)"$/m.exec(block)?.[1],
    }));
    assert.ok(entries.length > 0);
    const today = new Date().toISOString().slice(0, 10);
    for (const e of entries) {
      assert.match(e.id ?? '', /^GHSA-/);
      assert.ok(e.reason, `${e.id} needs a reason`);
      assert.ok(e.until && e.until >= today, `${e.id}: review it again, its ignoreUntil ${e.until} has passed`);
    }
    const list = JSON.parse(readFileSync(new URL('../../.github/audit-allowlist.json', import.meta.url), 'utf8'));
    for (const a of list.advisories) assert.ok(entries.some(e => e.id === a.id), `osv-scanner.toml lists ${a.id} too`);
  });
});

describe('CI definition', () => {
  it('ci.yml and publish.yml run the steps from tools/ci.js', () => {
    const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
    for (const job of Object.keys(JOBS)) assert.ok(ci.includes(`node tools/ci.js --job ${job}`), `ci.yml runs the ${job} job`);
    const publish = readFileSync(new URL('../../.github/workflows/publish.yml', import.meta.url), 'utf8');
    assert.ok(publish.includes('node tools/ci.js'));
    // npm reads a bare "dir/file.tgz" as a GitHub "user/repo" shorthand (EALLOWGIT, 0.9.1).
    const spec = /npm@[\d.]+ publish "\$TARBALL"/.test(publish) && /^\s+TARBALL: (.+)$/m.exec(publish)?.[1];
    assert.ok(spec && /^(\.\/|\/)/.test(spec), `npm publish gets a file path, not ${spec}`);
    assert.ok(!/npm audit --omit=dev/.test(ci), 'the runtime audit goes through the allowlist');
  });
});

