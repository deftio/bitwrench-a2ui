// The pure parts of tools/release.js: version arithmetic and the file rewrites.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bumpCdn, changelogSection, compareVersions, findStaged, nextVersion, promoteChangelog, releaseState } from '../../tools/release.js';
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
  });

  it('resumes from what GitHub has: tag, then merged PR, then open PR', () => {
    assert.equal(releaseState({ tagOnOrigin: true, pr: { state: 'OPEN' } }), 'publish');
    assert.equal(releaseState({ tagOnOrigin: false, pr: { state: 'MERGED' } }), 'tag');
    assert.equal(releaseState({ tagOnOrigin: false, pr: { state: 'OPEN' } }), 'checks');
    assert.equal(releaseState({ tagOnOrigin: false, pr: { state: 'CLOSED' } }), 'new');
    assert.equal(releaseState({ tagOnOrigin: false, pr: null }), 'new');
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
});

describe('CI definition', () => {
  it('ci.yml and publish.yml run the steps from tools/ci.js', () => {
    const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
    for (const job of Object.keys(JOBS)) assert.ok(ci.includes(`node tools/ci.js --job ${job}`), `ci.yml runs the ${job} job`);
    const publish = readFileSync(new URL('../../.github/workflows/publish.yml', import.meta.url), 'utf8');
    assert.ok(publish.includes('node tools/ci.js'));
    assert.ok(!/npm audit --omit=dev/.test(ci), 'the runtime audit goes through the allowlist');
  });
});

