# Release procedure

How bitwrench-a2ui versions are cut and published. Two pieces do the work: `tools/release.js` (`npm run release`) on the maintainer's machine, and `.github/workflows/release.yml` in CI. If this file and the scripts disagree, the scripts are right and this file is a bug.

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

One command does it:

```sh
npm run release -- patch        # or minor, major, or an explicit 0.10.0-rc.1
npm run release                 # release the version already in package.json
npm run release:dry -- patch    # rehearse: every check and gate, nothing kept or pushed
```

The script:

1. **Checks** the branch, tree, identity and version:
   * on `main`, clean, not behind `origin/main`
   * `git config user.name` is `deftio`, the active `gh` account is `deftio`, and `origin` is a `github.com/deftio/` repository
   * the tag is free, and the version is not on npm (a version published by hand is allowed when releasing the current version)
   * there are release notes: CHANGELOG.md content under `## Unreleased`, or an existing `## X.Y.Z` section
2. **Sets the version**:
   * `package.json` and `package-lock.json` (`npm version`), and the generated `src/version.js`
   * the `bitwrench-a2ui@X.Y.Z` CDN URLs
   * the CHANGELOG: `## Unreleased` becomes `## X.Y.Z - date`
3. **Runs the gates**:
   1. build
   2. version and CDN-tag checks
   3. every test with the 100% coverage gate
   4. the conformance report
   5. the package check, which installs the packed tarball into an empty project
   6. the site build
4. **Asks**, then commits `release: vX.Y.Z` (when anything changed) and creates the annotated tag `vX.Y.Z`. The tag is signed when git has a signing key.
5. **Asks**, then pushes `main` and the tag in one atomic push, follows the Release workflow with `gh run watch`, and prints the npm, GitHub Release and CDN links.

The tag starts `release.yml`, which:

1. **Checks the trigger** - it was pushed by a release maintainer, it matches `package.json`, and the tagged commit is on `main`.
2. **Builds once** - rebuilds, confirms the committed `dist/` matches, runs the full tests, the package check and `npm audit signatures`, and packs the tarball once.
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
  * Everyone else changes `main` through a pull request with a code-owner review and these checks green: tests on Node 22 and 24, the package job, CodeQL for both languages, and dependency review. CodeQL must also report no high or critical alerts.
  * No force pushes or deletion.
  * Repository admins bypass the ruleset, so the release script can push the release commit.
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
2. **Trusted publisher** - open the package's Settings > Trusted publishing > GitHub Actions, and enter:
   * owner `deftio`
   * repository `bitwrench-a2ui`
   * workflow `release.yml`
   * environment `npm`

   The values are case-sensitive and not checked on save; a mismatch only shows as `ENEEDAUTH` when CI publishes.
3. **Disallow tokens** - after the first CI publish works, set Settings > Publishing access to "Require two-factor authentication and disallow tokens".

## The first two releases

The first two releases test the two halves of the pipeline:

1. **0.9.0** - publish it by hand (above), then run `npm run release`. With no bump argument, the script releases the version in `package.json`: it notes that 0.9.0 is already on npm, tags the current commit, pushes, and follows the workflow. The workflow skips the npm step and creates the GitHub Release, which tests the build, attestation and release path.
2. **0.9.1** - set up the trusted publisher, add notes under `## Unreleased`, and run `npm run release -- patch`. This tests the whole path, including the OIDC publish with provenance.

## After a release

The script prints the links. To check by hand:

- [ ] npm has it, with provenance: `npm view bitwrench-a2ui@X.Y.Z`, and the "Provenance" panel on npmjs.com
- [ ] The GitHub Release has the notes and assets: https://github.com/deftio/bitwrench-a2ui/releases
- [ ] The CDN serves it: https://cdn.jsdelivr.net/npm/bitwrench-a2ui@X.Y.Z/dist/bitwrench-a2ui.min.js
- [ ] The files verify: `gh attestation verify bitwrench-a2ui-X.Y.Z.tgz -R deftio/bitwrench-a2ui`

## Recovery

When something goes wrong:

* **The workflow failed** - fix the cause and re-run the failed jobs from the Actions tab. Every step is safe to repeat: an existing npm version is not republished, and an existing GitHub Release gets its assets refreshed.
* **The tag is wrong and nothing was published** - `git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z` (admins only), fix it, and release again.
* **A bad version reached npm** - versions cannot be replaced. Run `npm deprecate bitwrench-a2ui@X.Y.Z "reason"` and release a patch. `npm unpublish` works only within 72 hours, and is a last resort.

## Rules

* After 0.9.0, there is no `npm publish` from a laptop: CI owns publishing.
* There are no hand-made release tags: the release script makes them, and the tag ruleset protects them.
* `dist/` is committed and must be byte-for-byte what the build produces. CI checks this on every push and on the tag.
* Dependencies are exact pins, upgraded through Dependabot pull requests or deliberately, with a full CI run.
* Actions are pinned to commit SHAs with the version in a comment; Dependabot updates both.
