// The pure parts of tools/release.js: version arithmetic and the file rewrites.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bumpCdn, compareVersions, nextVersion, promoteChangelog } from '../../tools/release.js';

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
});
