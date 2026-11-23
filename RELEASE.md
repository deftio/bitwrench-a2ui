# Release procedure

How bitwrench-a2ui versions are cut and published. Two pieces do the work: `tools/release.js` (`npm run release`) on the maintainer's machine, and `.github/workflows/publish.yml` in CI. `tools/ci.js` (`npm run ci`) is the one definition of the CI checks, used by both and by `ci.yml`. If this file and the scripts disagree, the scripts are right and this file is a bug.

Contributors do not need this file; see [CONTRIBUTING.md](CONTRIBUTING.md).

## The version

`package.json` is the single source of truth. Nothing else is edited by hand:

* **`src/version.js`** - generated from it by `tools/gen-version.js`, which every build runs.
* **Exports** - `VERSION` and `getVersion()` from the package, the same on the script-tag global (`bwA2UI.VERSION`, `bwA2UI.getVersion()`).
* **`renderer.version`** - the package version on each renderer. The A2UI protocol version is `renderer.protocolVersion`.
* **Build output** - the dist banners and `dist/builds.json` take it from `package.json` at build time.
* **CDN URLs** - the docs and examples are rewritten by the release script.

CI and the package check fail if any of these disagree with `package.json`.

## Cutting a release

One command does it, from a clean checkout of `main` or of a feature branch that contains `main`. You do not push anything yourself: the script pushes the release branch (with your branch's commits in it), and re-running it is always safe, because it continues from where GitHub says the release is, and reports a finished release as done:

```sh
npm run release                 # a patch release (0.9.0 -> 0.9.1)
npm run release -- minor        # or major, or an explicit 0.10.0-rc.1
npm run release:dry             # rehearse steps 1-4 in a scratch worktree; nothing is pushed
npm run release -- 0.9.1        # resume a stopped release from a checkout whose version moved on
```

Your checkout is never modified: the release is built in a fresh `git worktree` of the committed `HEAD`. The script:

1. **Checks** identity, tree and version:
   * `git config user.name` is `deftio`, `gh` is signed in as `deftio`, and `origin` is a `github.com/deftio/` repository
   * GitHub enforces the rulesets in `.github/rulesets/` as committed. If one is missing or different, the script offers to apply them with `tools/github-settings.sh`. Without them GitHub requires no check before a merge.
   * the tree is clean and `HEAD` contains `origin/main`
   * the tag `vX.Y.Z` is free, and the version is not on npm. A `release/vX.Y.Z` branch left on origin without an open PR (a stopped run, a closed PR) is replaced.
   * CHANGELOG.md has notes under `## Unreleased`
2. **Creates a worktree** of `HEAD` on branch `release/vX.Y.Z`, and runs `npm ci --ignore-scripts` there.
3. **Sets the version** and commits it as `release: vX.Y.Z` (locally):
   * `package.json` and `package-lock.json` (`npm version`), and the generated `src/version.js`
   * the `bitwrench-a2ui@X.Y.Z` CDN URLs
   * the CHANGELOG: `## Unreleased` becomes `## X.Y.Z - date`
   * the rebuilt `dist/` and the conformance report
4. **Runs local CI** on that commit: `tools/ci.js`, exactly the steps of `ci.yml` (version check, build, committed `dist/` matches, CDN tags, tests at 100% coverage, conformance report, package check with a real install, registry signatures, runtime audit, site build). If anything fails, the worktree and branch are deleted and nothing was pushed.
5. **Asks**, then pushes the branch and opens the pull request `release: vX.Y.Z` with the CHANGELOG notes. When the PR is already open but was built from an older `HEAD`, it force-pushes the rebuilt branch to that PR instead (see *Fix and run again* below).
6. **Waits for the checks** on the PR (`gh pr checks --watch`): the ones the `main` ruleset requires, or every check if it requires none. If one fails, the PR stays open: commit the fix and run the release again.
7. **Asks**, then squash-merges the PR as `release: vX.Y.Z (#N)`, pinned to the head commit that passed. As the only maintainer you cannot approve your own PR, so it merges with admin rights (`gh pr merge --admin`) after the script has seen every required check pass. With a second maintainer, `--auto-merge` waits for their approval instead.
8. **Asks**, then tags the merge commit `vX.Y.Z` (annotated, or signed when git has a signing key) and pushes the tag, after checking that the merge commit is on `main`, has the version, and has the tree that passed CI.
9. **Follows `publish.yml`** to the end. If npm staged the version, the script shows the staged entry and approves it in the terminal (`npm stage approve`, which asks for your 2FA code): no npmjs.com or GitHub web UI step. If the run failed, re-running the script offers to re-run its failed jobs.
10. **Cleans up** - deletes the release branch, prints the npm, GitHub Release and CDN links, and offers to tidy your checkout: on `main`, fast-forward it; on a feature branch whose commits all went into the release, switch to the updated `main` and delete that branch (locally and on origin).

Every step that changes something on GitHub or npm asks first (`--yes` skips the questions).

The tag starts `publish.yml`, which:

1. **Checks the trigger** - it was pushed by a release maintainer, it matches `package.json`, and the tagged commit is on `main`.
2. **Builds once** - runs every CI check again on the tagged commit (`tools/ci.js`), and packs the tarball once.
3. **Publishes to npm** - the same tarball, with **trusted publishing** (OIDC, no stored token), which attaches **provenance**. It skips this if the version is already on npm.
4. **Creates the GitHub Release** - it attests build provenance for the tarball and dist files, then creates or updates the release with the CHANGELOG notes, the tarball, the dist files and `SHA256SUMS`.

Pre-release versions (`0.10.0-rc.1`) go to the npm dist-tag `next` and are marked as pre-releases on GitHub; others go to `latest`.

## Setup, once

### GitHub settings

Run `tools/github-settings.sh`, signed in to `gh` as `deftio` (it is idempotent; `--show` prints the current state). It applies:

* **Security** - private vulnerability reporting, Dependabot alerts and security updates, secret scanning with push protection. CodeQL "default setup" is turned off, because `codeql.yml` is the advanced setup and the two conflict.
* **Actions** - `GITHUB_TOKEN` is read-only by default (each job asks for what it needs), and workflows cannot approve pull requests.
* **Environment `npm`** - only `v*` tags may deploy to it. Add yourself as a required reviewer in Settings > Environments if every publish should wait for a click.
* **Ruleset `main`** (`.github/rulesets/main.json`):
  * Every change to `main`, releases included, goes through a pull request. Contributors need a code-owner review and these checks green: tests on Node 22 and 24, the package job, CodeQL for both languages, and dependency review. CodeQL must also report no high or critical alerts.
  * No force pushes or deletion.
  * Repository admins can bypass the ruleset. The release script uses that only to merge its own release PR after the required checks pass (you cannot approve your own PR); never push to `main` directly.
* **Allow auto-merge** - only needed for `--auto-merge` with a second maintainer: Settings > General > Pull Requests.
* **Ruleset `release tags`** (`.github/rulesets/release-tags.json`) - only repository admins can create, move or delete `v*` tags.

For a second maintainer who may release: make them a repository admin and add their login to the `RELEASE_MAINTAINERS` repository variable (space separated; default `deftio`). The release workflow refuses tags pushed by anyone else. Maintainers who should not release get the write role: they merge reviewed pull requests but cannot push to `main` or create release tags.

### npm

The steps on npmjs.com:

1. **The first version is published by hand** - npm's trusted-publisher settings live on the package page, which exists only after a first publish:
   ```sh
   npm run build && npm run test:coverage
   npm login                 # the deftio npm account, with 2FA
   npm publish               # prepublishOnly runs tools/check-package.js
   ```
   That version has no provenance statement; every later one does.

   If the publish was staged (the registry then shows only a `0.0.0-stage` placeholder), approve it: `npm stage list bitwrench-a2ui`, then `npm stage approve <stage-id>` (2FA), or Staged Packages on npmjs.com. Afterwards, `npm view bitwrench-a2ui dist-tags` must show `latest: 0.9.0`.
2. **Trusted publisher** - open the package's Settings > Trusted publishing > GitHub Actions, and enter:
   * owner `deftio`
   * repository `bitwrench-a2ui`
   * workflow `publish.yml`
   * environment `npm`
   * allowed actions: enable "Allow npm publish" (`npm stage publish` is always allowed; the workflow runs `npm publish`)

   The values are case-sensitive and not checked on save; a mismatch only shows as `ENEEDAUTH` when CI publishes. A new trusted publisher expires unless it publishes within 2 days, so set it up just before the next release.
3. **Disallow tokens** - after the first CI publish works, set Settings > Publishing access to "Require two-factor authentication and disallow tokens".

## The first releases

* **0.9.0** - published by hand. npm staged it, and the first tag run (under the workflow's old name, `release.yml`) failed at npm, as expected with no trusted publisher yet. `npm run release -- 0.9.0` finishes it: it approves the staged version in the terminal, re-runs the failed jobs, which skip npm and create the GitHub Release.
* **0.9.1** - set up the trusted publisher just before (it expires after 2 days unused), then `npm run release`. This tests the whole path, including the OIDC publish with provenance.

## After a release

The script prints the links. To check by hand:

- [ ] npm has it, with provenance: `npm view bitwrench-a2ui@X.Y.Z`, and the "Provenance" panel on npmjs.com
- [ ] The GitHub Release has the notes and assets: https://github.com/deftio/bitwrench-a2ui/releases
- [ ] The CDN serves it: https://cdn.jsdelivr.net/npm/bitwrench-a2ui@X.Y.Z/dist/bitwrench-a2ui.min.js
- [ ] The files verify: `gh attestation verify bitwrench-a2ui-X.Y.Z.tgz -R deftio/bitwrench-a2ui`

## Recovery

### Fix and run again

Until the release PR is merged, fixing a release is the same as making it: commit the fix on your branch and run `npm run release` (or `npm run release -- X.Y.Z`) again, as often as needed. The script compares your `HEAD` with the open PR:

* **The PR contains `HEAD`** (nothing new) - it resumes: waits for the checks, merges, tags, publishes.
* **`HEAD` has commits the PR does not** - it rebuilds the release commit from `HEAD` (steps 2-4: fresh worktree, version, local CI), lists what it replaces on the release branch, asks, force-pushes the branch with a lease, and updates the PR body. The checks run again on the new head.

Do not push fixes to the `release/vX.Y.Z` branch yourself: the next run replaces it from your `HEAD`. Once the PR is merged, the version is fixed, and later fixes go into the next version.

### When something goes wrong

* **The release stopped** - run `npm run release -- X.Y.Z` again. It reads where the release is from GitHub (an open PR, a merged PR without a tag, or a tag) and continues from there.
* **The workflow failed** - fix the cause; re-running the script offers to re-run the failed jobs. Every step is safe to repeat: an existing npm version is not republished, and an existing GitHub Release gets its assets refreshed.
* **The tag is wrong and nothing was published** - `git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z` (admins only), fix it, and release again.
* **A bad version reached npm** - versions cannot be replaced. Run `npm deprecate bitwrench-a2ui@X.Y.Z "reason"` and release a patch. `npm unpublish` works only within 72 hours, and is a last resort.

## Rules

* After 0.9.0, there is no `npm publish` from a laptop: CI owns publishing.
* Releases are pull requests like any other change: the version bump is never pushed straight to `main`.
* There are no hand-made release tags: the release script makes them, and the tag ruleset protects them.
* `dist/` is committed and must be byte-for-byte what the build produces. CI checks this on every push and on the tag.
* Dependencies are exact pins, upgraded through Dependabot pull requests or deliberately, with a full CI run.
* Actions are pinned to commit SHAs with the version in a comment; Dependabot updates both.
